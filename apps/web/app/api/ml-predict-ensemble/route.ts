/**
 * 사정율 예측 API — optuna_10K 카테고리별 가중 (박상빈님 5/20 명시)
 *
 * 운영 모델: Optuna 10000 trial × 15 카테고리 자동 학습 가중
 *   - 카테고리별 4 모델 가중 (B-q70 / B-q60 / B-q80 / M1)
 *   - M1 = v2*0.15 + tuned*0.15 + xgb*0.10 + cat*0.00 + q95*0.60
 *   - 소카테고리 (N<500) = _DEFAULT_ (0.5 × B-q70 + 0.5 × M1) 폴백
 *
 * 145K 백테스트 (공사 + 복수예가):
 *   - optuna_10K = 부적격 34.34% / 1위 5.32% / 점수 3.607 (전체 ML 점수 1위)
 *   - vs cat3 (직전 운영) = 부적격 +1.26%p (미미) + 1위 +0.21%p ↑ / 점수 +0.151 ↑
 *   - vs M1-N03 (5/19 03시) = 부적격 -3.52%p ↓ + 1위 +0.42%p ↑ / 점수 +0.601 ↑
 */
import { NextRequest, NextResponse } from "next/server";
import * as ort from "onnxruntime-web";
import path from "path";
import fs from "fs";
import { captureError } from "@/lib/observability/sentry";

const ML_API_KEY = process.env.ML_API_KEY ?? "";
function authOk(req: NextRequest): boolean {
  if (!ML_API_KEY) return true;
  return req.headers.get("x-api-key") === ML_API_KEY;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ML_DIR = path.join(process.cwd(), "ml");
const MANIFEST_PATH = path.join(ML_DIR, "ensemble_manifest.json");

interface OptunaWeights {
  B_q70: number;
  B_q60: number;
  B_q80: number;
  M1: number;
}
interface Manifest {
  version: string;
  bundled_models: Record<string, string>;
  M1_inner_weights: Record<string, number>;
  category_optuna_weights: Record<string, OptunaWeights>;
}

interface ModelMeta {
  feature_names: string[];
  categorical_cols: string[];
  numeric_cols?: string[];
  encoders: Record<string, string[] | Record<string, number>>;
}

ort.env.wasm.wasmPaths = {
  wasm: `file://${path.join(ML_DIR, "ort-wasm-simd-threaded.wasm").replace(/\\/g, "/")}`,
  mjs:  `file://${path.join(ML_DIR, "ort-wasm-simd-threaded.mjs").replace(/\\/g, "/")}`,
};
ort.env.wasm.numThreads = 1;

const sessionCache = new Map<string, Promise<ort.InferenceSession>>();
const metaCache    = new Map<string, ModelMeta>();
let manifestCache: Manifest | null = null;

function getManifest(): Manifest {
  if (!manifestCache) manifestCache = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
  return manifestCache!;
}

function getMeta(modelKey: string): ModelMeta {
  const cached = metaCache.get(modelKey);
  if (cached) return cached;
  const meta = JSON.parse(fs.readFileSync(path.join(ML_DIR, `${modelKey}_meta.json`), "utf-8")) as ModelMeta;
  metaCache.set(modelKey, meta);
  return meta;
}

async function getSession(modelKey: string): Promise<ort.InferenceSession> {
  const cached = sessionCache.get(modelKey);
  if (cached) return cached;
  const manifest = getManifest();
  const promise = (async () => {
    const bundled = manifest.bundled_models[modelKey];
    if (!bundled) throw new Error(`Unknown model: ${modelKey}`);
    const fname = bundled.replace("/ml/", "");
    const data = fs.readFileSync(path.join(ML_DIR, fname));
    const buffer = new ArrayBuffer(data.byteLength);
    new Uint8Array(buffer).set(data);
    return await ort.InferenceSession.create(buffer);
  })();
  promise.catch(() => sessionCache.delete(modelKey));
  sessionCache.set(modelKey, promise);
  return promise;
}

function encodeCat(value: unknown, enc: string[] | Record<string, number> | undefined): number {
  if (!enc) return 0;
  const v = String(value ?? "");
  if (Array.isArray(enc)) {
    const idx = enc.indexOf(v);
    if (idx >= 0) return idx;
    const unkIdx = enc.indexOf("UNK");
    return unkIdx >= 0 ? unkIdx : 0;
  }
  if (Object.prototype.hasOwnProperty.call(enc, v)) return Number(enc[v] ?? 0);
  if (Object.prototype.hasOwnProperty.call(enc, "UNK")) return Number(enc["UNK"] ?? 0);
  return 0;
}

function buildInput(features: Record<string, unknown>, meta: ModelMeta): Float32Array {
  const catCols = meta.categorical_cols ?? Object.keys(meta.encoders ?? {});
  const arr = new Float32Array(meta.feature_names.length);
  for (let i = 0; i < meta.feature_names.length; i++) {
    const col = meta.feature_names[i] ?? "";
    if (catCols.includes(col)) {
      arr[i] = encodeCat(features[col], meta.encoders[col]);
    } else {
      const v = features[col];
      arr[i] = typeof v === "number" && Number.isFinite(v) ? v : 0;
    }
  }
  return arr;
}

async function runOne(modelKey: string, features: Record<string, unknown>): Promise<number> {
  const meta = getMeta(modelKey);
  const session = await getSession(modelKey);
  const input = buildInput(features, meta);
  const tensor = new ort.Tensor("float32", input, [1, meta.feature_names.length]);
  const inputName = session.inputNames[0] ?? "input";
  const out = await session.run({ [inputName]: tensor });
  const outputName = session.outputNames[0] ?? "";
  const data = out[outputName]?.data as Float32Array;
  return Number(data?.[0] ?? 0);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!authOk(request)) {
    return NextResponse.json({ error: "invalid api key" }, { status: 401 });
  }
  // rate limit X — server-to-server 내부 호출 (ml-client.ts fetchMlEnsemble). 사용자측은 comprehensive 에서 user.id 20/min 제한.

  try {
    const features = (await request.json()) as Record<string, unknown>;
    const manifest = getManifest();

    // category 추출 → optuna 가중치 선택
    const category = String(features["category"] ?? "_DEFAULT_");
    const weights: OptunaWeights =
      manifest.category_optuna_weights[category] ??
      manifest.category_optuna_weights["_DEFAULT_"] ??
      { B_q70: 0.5, B_q60: 0.0, B_q80: 0.0, M1: 0.5 };

    // 4 모델 추론 (B-q70 / B-q60 / B-q80 / M1) + 박상빈님 5/21 박스권 ML 사용자별 다양화 (B-q40)
    const [bq40, bq70, bq60, bq80, v2, tuned, xgb, cat, q95] = await Promise.all([
      runOne("sajung_quantile_q40", features),
      runOne("sajung_quantile_q70", features),
      runOne("sajung_quantile_q60", features),
      runOne("sajung_quantile_q80", features),
      runOne("sajung_lgbm_v2", features),
      runOne("sajung_lgbm_v3_tuned", features),
      runOne("sajung_xgboost", features),
      runOne("sajung_catboost", features),
      runOne("sajung_quantile_q95", features),
    ]);

    // M1 = 5way 가중평균
    const mw = manifest.M1_inner_weights;
    const m1 =
      v2 * (mw.sajung_lgbm_v2 ?? 0.15) +
      tuned * (mw.sajung_lgbm_v3_tuned ?? 0.15) +
      xgb * (mw.sajung_xgboost ?? 0.10) +
      cat * (mw.sajung_catboost ?? 0.00) +
      q95 * (mw.sajung_quantile_q95 ?? 0.60);

    // optuna 카테고리별 가중 적용
    const recommended =
      bq70 * weights.B_q70 +
      bq60 * weights.B_q60 +
      bq80 * weights.B_q80 +
      m1 * weights.M1;

    // 4 예측 std → 신뢰구간
    const all = [bq70, bq60, bq80, m1];
    const mean = all.reduce((s, v) => s + v, 0) / all.length;
    const variance = all.reduce((s, v) => s + (v - mean) ** 2, 0) / all.length;
    const std = Math.sqrt(variance);
    const margin = Math.max(std * 1.96, 0.3);

    return NextResponse.json({
      recommended_sajung_rate: recommended,
      ensemble_sajung_q05: recommended - margin,
      ensemble_sajung_q50: recommended,
      ensemble_sajung_q95: recommended + margin,
      ensemble_lwlt_q05: recommended - margin,
      ensemble_lwlt_q50: recommended,
      ensemble_lwlt_q95: recommended + margin,
      category,
      weights,
      models: { bq40, bq70, bq60, bq80, m1, v2, tuned, xgb, cat, q95 },
      // 박상빈님 5/21 K-2 박스권 ML 사용자별 다양화 (sajung-engine.ts 가 user hash 적용)
      box_q40: bq40,
      box_q70: bq70,
      model_version: manifest.version,
    });
  } catch (e) {
    captureError(e as Error, { route: "ml-predict-ensemble" });
    console.error("[ml-predict-ensemble] 오류:", (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  const manifest = getManifest();
  return NextResponse.json({
    status: "ok",
    version: manifest.version,
    bundled: Object.keys(manifest.bundled_models),
    category_optuna_weights: manifest.category_optuna_weights,
    cached_sessions: Array.from(sessionCache.keys()),
  });
}
