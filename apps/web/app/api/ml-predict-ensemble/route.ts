/**
 * Ensemble 사정율 예측 API — v2 + xgb + cat 가중평균 (박상빈님 5/17 명시)
 *
 * 구조 (단순):
 *   1) sajung_lgbm_v2.onnx     — LightGBM v2 (1.84M 학습, MAE 0.5844)
 *   2) sajung_xgboost.onnx     — XGBoost   (1.84M 학습, MAE 0.5836)
 *   3) sajung_catboost.onnx    — CatBoost ONNX-compat (1.84M 학습, MAE 0.5837)
 *
 * 모두 54 피처 동일 구조, 각 모델 자체 encoders 사용.
 * recommended_sajung_rate = (v2 + xgb + cat) / 3
 *
 * 모델 손실 시 호출측 (sajung-engine) σ × z 폴백 자동 발동.
 */
import { NextRequest, NextResponse } from "next/server";
import * as ort from "onnxruntime-web";
import path from "path";
import fs from "fs";
import { captureError } from "@/lib/observability/sentry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ML_DIR = path.join(process.cwd(), "ml");
const MANIFEST_PATH = path.join(ML_DIR, "ensemble_manifest.json");

interface Manifest {
  version: string;
  bundled_models: Record<string, string>;
  remote_models: Record<string, string>;
  weights: Record<string, number>;
}

interface ModelMeta {
  feature_names: string[];
  categorical_cols: string[];
  numeric_cols?: string[];
  // v2: {col: {className: idx}} (dict)
  // xgb/cat: {col: [class1, class2, ...]} (list)
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
  const metaPath = path.join(ML_DIR, `${modelKey}_meta.json`);
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as ModelMeta;
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
    const fullPath = path.join(ML_DIR, fname);
    const data = fs.readFileSync(fullPath);
    const buffer = new ArrayBuffer(data.byteLength);
    new Uint8Array(buffer).set(data);
    return await ort.InferenceSession.create(buffer);
  })();
  promise.catch(() => sessionCache.delete(modelKey));
  sessionCache.set(modelKey, promise);
  return promise;
}

/** label encoder 매핑 — v2 dict {className:idx} / xgb·cat list [classes_] 양쪽 지원 */
function encodeCat(value: unknown, enc: string[] | Record<string, number> | undefined): number {
  if (!enc) return 0;
  const v = String(value ?? "");
  if (Array.isArray(enc)) {
    if (enc.length === 0) return 0;
    const idx = enc.indexOf(v);
    if (idx >= 0) return idx;
    const unkIdx = enc.indexOf("UNK");
    return unkIdx >= 0 ? unkIdx : 0;
  }
  // dict
  if (Object.prototype.hasOwnProperty.call(enc, v)) return Number(enc[v] ?? 0);
  if (Object.prototype.hasOwnProperty.call(enc, "UNK")) return Number(enc["UNK"] ?? 0);
  return 0;
}

function buildInput(features: Record<string, unknown>, meta: ModelMeta): Float32Array {
  // fallback: xgb/cat meta 에 categorical_cols 누락 시 encoders keys 사용
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
    const weights = manifest.weights;

    const [v2, xgb, cat] = await Promise.all([
      runOne("sajung_lgbm_v2", features),
      runOne("sajung_xgboost", features),
      runOne("sajung_catboost", features),
    ]);

    const wV2  = Number(weights.sajung_lgbm_v2  ?? 1/3);
    const wXgb = Number(weights.sajung_xgboost  ?? 1/3);
    const wCat = Number(weights.sajung_catboost ?? 1/3);
    const wSum = wV2 + wXgb + wCat;
    const avg  = (v2 * wV2 + xgb * wXgb + cat * wCat) / (wSum > 0 ? wSum : 1);

    // 3개 예측 std → 신뢰구간 추정
    const mean = (v2 + xgb + cat) / 3;
    const variance = ((v2 - mean) ** 2 + (xgb - mean) ** 2 + (cat - mean) ** 2) / 3;
    const std = Math.sqrt(variance);
    const margin = Math.max(std * 1.96, 0.3);  // 정상범위 최소 ±0.3%p

    return NextResponse.json({
      // 호환 필드 (기존 호출자)
      recommended_sajung_rate: avg,
      ensemble_sajung_q05: avg - margin,
      ensemble_sajung_q50: avg,
      ensemble_sajung_q95: avg + margin,
      ensemble_lwlt_q05: avg - margin,
      ensemble_lwlt_q50: avg,
      ensemble_lwlt_q95: avg + margin,
      // 디버깅 / 모델별 개별값
      v2_pred:  v2,
      xgb_pred: xgb,
      cat_pred: cat,
      weights: { v2: wV2 / wSum, xgb: wXgb / wSum, cat: wCat / wSum },
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
    weights: manifest.weights,
    cached_sessions: Array.from(sessionCache.keys()),
  });
}
