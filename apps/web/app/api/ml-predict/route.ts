/**
 * ML 사정율 예측 API (Next.js Route Handler)
 *
 * v2(54 피처) + tuned(60 피처, 하이퍼파라미터 튜닝 v3) 가중 앙상블.
 * ensemble_sajung.py 4-way 실측 best (v2/v3/tuned/v4 그리드):
 *   w_v2=0.9, w_v3=0.0, w_tn=0.1, w_v4=0.0 → val 0.4896, test 0.4813
 *   (v3는 tuned에 흡수되어 기여 0, v4 KoBERT는 추가 마진 0이라 미적용)
 *
 * 호출자가 일부 피처만 제공해도 동작 (미제공 피처는 학습 시 global default로 채움).
 *
 * 엔드포인트:
 *   GET  /api/ml-predict  → health check
 *   POST /api/ml-predict  → 예측 (ML_API_KEY 설정 시 X-API-Key 헤더 검증)
 */
import { NextRequest, NextResponse } from "next/server";
import * as ort from "onnxruntime-web";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const ML_DIR = path.join(process.cwd(), "ml");
const V2_MODEL = path.join(ML_DIR, "sajung_lgbm_v2.onnx");
const V2_META = path.join(ML_DIR, "sajung_lgbm_v2_meta.json");
const TUNED_MODEL = path.join(ML_DIR, "sajung_lgbm_v3_tuned.onnx");
const TUNED_META = path.join(ML_DIR, "sajung_lgbm_v3_tuned_meta.json");

// 앙상블 가중치 (ensemble_sajung.py 4-way 실측 best)
const W_V2 = 0.9;
const W_TUNED = 0.1;

// 학습 시 expanding mean의 결측 → 전역 평균/표준편차로 채움 (merge_raw.py 참고)
const GLOBAL_SAJUNG_MEAN = 99.72;
const GLOBAL_SAJUNG_STD = 0.95;

function featureDefault(col: string): number {
  if (col.endsWith("_mean")) return GLOBAL_SAJUNG_MEAN;
  if (col.endsWith("_std")) return GLOBAL_SAJUNG_STD;
  if (col.endsWith("_cnt")) return 0;
  if (col === "lwltRate") return 87.745;
  return 0;
}

// onnxruntime-web이 WASM 파일을 찾을 위치 지정 (번들에 포함된 local 경로)
// file:// 프로토콜로 명시해야 Node.js dynamic import가 동작
ort.env.wasm.wasmPaths = {
  wasm: `file://${path.join(ML_DIR, "ort-wasm-simd-threaded.wasm").replace(/\\/g, "/")}`,
  mjs: `file://${path.join(ML_DIR, "ort-wasm-simd-threaded.mjs").replace(/\\/g, "/")}`,
};
// 스레드 비활성화 (서버리스 환경)
ort.env.wasm.numThreads = 1;

interface Metadata {
  encoders: Record<string, Record<string, number>>;
  feature_names: string[];
  categorical_cols: string[];
  model_version: string;
  metrics?: Record<string, number>;
}

interface ModelEntry {
  session: ort.InferenceSession;
  meta: Metadata;
}

let v2Model: ModelEntry | null = null;
let tunedModel: ModelEntry | null = null;
let initError: string | null = null;

async function loadModel(modelPath: string, metaPath: string): Promise<ModelEntry> {
  const raw = fs.readFileSync(metaPath, "utf8");
  const meta = JSON.parse(raw) as Metadata;
  const buf = fs.readFileSync(modelPath);
  const session = await ort.InferenceSession.create(buf);
  return { session, meta };
}

async function init(): Promise<void> {
  if (v2Model && tunedModel) return;
  try {
    if (!v2Model) v2Model = await loadModel(V2_MODEL, V2_META);
    if (!tunedModel) tunedModel = await loadModel(TUNED_MODEL, TUNED_META);
  } catch (err) {
    initError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw err;
  }
}

const API_KEY = process.env.ML_API_KEY ?? "";

function authOk(req: NextRequest): boolean {
  if (!API_KEY) return true;
  return req.headers.get("x-api-key") === API_KEY;
}

export async function GET() {
  try {
    await init();
    return NextResponse.json({
      status: "ok",
      model_version: `ensemble(v2:${W_V2.toFixed(2)} + tuned:${W_TUNED.toFixed(2)})`,
      feature_count: tunedModel!.meta.feature_names.length,
      metrics: {
        mae_test_v2: v2Model!.meta.metrics?.mae_test ?? 0,
        mae_test_tuned: tunedModel!.meta.metrics?.mae_test ?? 0,
        mae_test_ensemble: 0.4813,
      },
    });
  } catch {
    return NextResponse.json(
      { status: "error", error: initError },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  if (!authOk(req)) {
    return NextResponse.json({ error: "invalid api key" }, { status: 401 });
  }
  try {
    await init();
  } catch {
    return NextResponse.json(
      { error: `init failed: ${initError}` },
      { status: 500 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  function buildRow(meta: Metadata): Float32Array {
    const row = new Float32Array(meta.feature_names.length);
    for (let i = 0; i < meta.feature_names.length; i++) {
      const col = meta.feature_names[i]!;
      const raw = body[col];
      if (meta.categorical_cols.includes(col)) {
        const key = raw == null ? "" : String(raw);
        row[i] = meta.encoders[col]?.[key] ?? -1;
      } else {
        const n = Number(raw);
        row[i] = Number.isFinite(n) ? n : featureDefault(col);
      }
    }
    return row;
  }

  async function runOne(entry: ModelEntry): Promise<number> {
    const row = buildRow(entry.meta);
    const tensor = new ort.Tensor("float32", row, [1, row.length]);
    const feeds: Record<string, ort.Tensor> = {};
    feeds[entry.session.inputNames[0]!] = tensor;
    const out = await entry.session.run(feeds);
    const outData = out[entry.session.outputNames[0]!]!.data as Float32Array;
    return outData[0]!;
  }

  try {
    const [predV2, predTuned] = await Promise.all([runOne(v2Model!), runOne(tunedModel!)]);
    let pred = W_V2 * predV2 + W_TUNED * predTuned;
    // 사정율 유효 범위 clipping
    pred = Math.max(97, Math.min(103, pred));
    return NextResponse.json({
      predicted_sajung_rate: Math.round(pred * 10000) / 10000,
      model_version: `ensemble(v2:${W_V2.toFixed(2)} + tuned:${W_TUNED.toFixed(2)})`,
      components: {
        v2: Math.round(predV2 * 10000) / 10000,
        tuned: Math.round(predTuned * 10000) / 10000,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `predict failed: ${msg}` }, { status: 500 });
  }
}
