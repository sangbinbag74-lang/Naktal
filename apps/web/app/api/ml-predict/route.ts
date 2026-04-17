/**
 * ML 사정율 예측 API (Next.js Route Handler)
 *
 * LightGBM → ONNX 변환된 모델을 onnxruntime-node로 직접 추론.
 * apps/web/ml/sajung_lgbm.onnx + sajung_encoders.json 사용.
 *
 * 엔드포인트:
 *   GET  /api/ml-predict  → health check
 *   POST /api/ml-predict  → 예측 (ML_API_KEY 설정 시 X-API-Key 헤더 검증)
 */
import { NextRequest, NextResponse } from "next/server";
import * as ort from "onnxruntime-node";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const MODEL_PATH = path.join(process.cwd(), "ml", "sajung_lgbm.onnx");
const ENCODERS_PATH = path.join(process.cwd(), "ml", "sajung_encoders.json");

interface Metadata {
  encoders: Record<string, Record<string, number>>;
  feature_names: string[];
  categorical_cols: string[];
  model_version: string;
}

let session: ort.InferenceSession | null = null;
let metadata: Metadata | null = null;
let initError: string | null = null;

async function init(): Promise<void> {
  if (session && metadata) return;
  try {
    if (!metadata) {
      const raw = fs.readFileSync(ENCODERS_PATH, "utf8");
      metadata = JSON.parse(raw) as Metadata;
    }
    if (!session) {
      session = await ort.InferenceSession.create(MODEL_PATH);
    }
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
      model_version: metadata!.model_version,
      feature_count: metadata!.feature_names.length,
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

  // 피처 행 구성 (Float32Array)
  const meta = metadata!;
  const row = new Float32Array(meta.feature_names.length);
  for (let i = 0; i < meta.feature_names.length; i++) {
    const col = meta.feature_names[i]!;
    const raw = body[col];
    if (meta.categorical_cols.includes(col)) {
      const key = raw == null ? "" : String(raw);
      row[i] = meta.encoders[col]?.[key] ?? -1;
    } else {
      const n = Number(raw);
      row[i] = Number.isFinite(n) ? n : 0;
    }
  }

  try {
    const tensor = new ort.Tensor("float32", row, [1, row.length]);
    const feeds: Record<string, ort.Tensor> = {};
    feeds[session!.inputNames[0]!] = tensor;
    const out = await session!.run(feeds);
    const outData = out[session!.outputNames[0]!]!.data as Float32Array;
    let pred = outData[0]!;
    // 사정율 유효 범위 clipping
    pred = Math.max(97, Math.min(103, pred));
    return NextResponse.json({
      predicted_sajung_rate: Math.round(pred * 10000) / 10000,
      model_version: meta.model_version,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `predict failed: ${msg}` }, { status: 500 });
  }
}
