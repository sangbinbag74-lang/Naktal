/**
 * 사정율 예측 API — cat3 카테고리별 가중 (박상빈님 5/19 명시)
 *
 * 운영 모델: 카테고리별로 다른 변형 자동 선택 (cat3)
 *   - 시설/토목/통신/기계/상하수도/소방/조경 → B-q70-M1 (0.5×B-q70 + 0.5×M1)
 *   - 건축/도장/철근/구조물해체 → 0.5×B-q70 + 0.5×B-q80 (부적격 ↓)
 *   - 전기/지반조성 → 0.5×B-q70 + 0.5×B-q60 (1위 ↑)
 *   - 실내건축 → B-q70 단독
 *   - 조경식재 → 1/3×(B-q60 + B-q70 + B-q80)
 *   - 그 외 (소카테고리) → B-q70-M1 폴백
 *
 * M1 = v2*0.15 + tuned*0.15 + xgb*0.10 + cat*0.00 + q95*0.60
 *
 * 145K 백테스트 (공사 + 복수예가):
 *   - cat3 = 부적격 33.08% / 1위 5.11% / 점수 3.456 (점수 1위, 127 ensemble 중 최고)
 *   - vs B-q70-M1 (직전 운영) = 부적격 -2.05%p ↓ + 1위 +0.03%p ↑
 *   - vs M1-N03 (5/19 03시 운영) = 부적격 -4.78%p ↓ + 1위 +0.21%p ↑
 */
import { NextRequest, NextResponse } from "next/server";
import * as ort from "onnxruntime-web";
import path from "path";
import fs from "fs";
import { captureError } from "@/lib/observability/sentry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ML_DIR = path.join(process.cwd(), "ml");
const MANIFEST_PATH = path.join(ML_DIR, "ensemble_manifest.json");

interface CategoryVariant { type: string; note?: string; }
interface Manifest {
  version: string;
  bundled_models: Record<string, string>;
  M1_inner_weights: Record<string, number>;
  category_variants: Record<string, CategoryVariant>;
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
  try {
    const features = (await request.json()) as Record<string, unknown>;
    const manifest = getManifest();

    // category 추출 → 변형 선택
    const category = String(features["category"] ?? "_DEFAULT_");
    const variant = manifest.category_variants[category] ?? manifest.category_variants["_DEFAULT_"];
    const vtype = variant?.type ?? "bq70_m1";

    let recommended: number;
    let modelsUsed: Record<string, number> = {};

    if (vtype === "bq70_solo") {
      // B-q70 단독
      const bq70 = await runOne("sajung_quantile_q70", features);
      recommended = bq70;
      modelsUsed = { B_q70: bq70 };
    } else if (vtype === "bq70_q60") {
      // 0.5 × B-q70 + 0.5 × B-q60
      const [bq70, bq60] = await Promise.all([
        runOne("sajung_quantile_q70", features),
        runOne("sajung_quantile_q60", features),
      ]);
      recommended = 0.5 * bq70 + 0.5 * bq60;
      modelsUsed = { B_q70: bq70, B_q60: bq60 };
    } else if (vtype === "bq70_q80") {
      // 0.5 × B-q70 + 0.5 × B-q80
      const [bq70, bq80] = await Promise.all([
        runOne("sajung_quantile_q70", features),
        runOne("sajung_quantile_q80", features),
      ]);
      recommended = 0.5 * bq70 + 0.5 * bq80;
      modelsUsed = { B_q70: bq70, B_q80: bq80 };
    } else if (vtype === "bq60_q70_q80") {
      // 1/3 × B-q60 + 1/3 × B-q70 + 1/3 × B-q80
      const [bq60, bq70, bq80] = await Promise.all([
        runOne("sajung_quantile_q60", features),
        runOne("sajung_quantile_q70", features),
        runOne("sajung_quantile_q80", features),
      ]);
      recommended = (bq60 + bq70 + bq80) / 3;
      modelsUsed = { B_q60: bq60, B_q70: bq70, B_q80: bq80 };
    } else {
      // 기본: bq70_m1 = 0.5 × B-q70 + 0.5 × M1(5way)
      const [bq70, v2, tuned, xgb, cat, q95] = await Promise.all([
        runOne("sajung_quantile_q70", features),
        runOne("sajung_lgbm_v2", features),
        runOne("sajung_lgbm_v3_tuned", features),
        runOne("sajung_xgboost", features),
        runOne("sajung_catboost", features),
        runOne("sajung_quantile_q95", features),
      ]);
      const w = manifest.M1_inner_weights;
      const m1 =
        v2 * (w.sajung_lgbm_v2 ?? 0.15) +
        tuned * (w.sajung_lgbm_v3_tuned ?? 0.15) +
        xgb * (w.sajung_xgboost ?? 0.10) +
        cat * (w.sajung_catboost ?? 0.00) +
        q95 * (w.sajung_quantile_q95 ?? 0.60);
      recommended = 0.5 * bq70 + 0.5 * m1;
      modelsUsed = { B_q70: bq70, M1: m1, v2, tuned, xgb, cat, q95 };
    }

    const margin = 0.3;
    return NextResponse.json({
      recommended_sajung_rate: recommended,
      ensemble_sajung_q05: recommended - margin,
      ensemble_sajung_q50: recommended,
      ensemble_sajung_q95: recommended + margin,
      ensemble_lwlt_q05: recommended - margin,
      ensemble_lwlt_q50: recommended,
      ensemble_lwlt_q95: recommended + margin,
      category,
      variant_type: vtype,
      models: modelsUsed,
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
    category_variants: manifest.category_variants,
    cached_sessions: Array.from(sessionCache.keys()),
  });
}
