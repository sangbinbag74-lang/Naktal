/**
 * ⚠️ 2026-04-24 배포 포기 — RMSE 59명, 실용 불가
 *    memory/project_ml_model3_abandoned.md 참조
 *    endpoint 보존 (ONNX 파일 없음 → init 실패 → 호출 시 500)
 *    UI/엔진에서 호출 제거됨
 *
 * Model 3 — 참여자수 예측 API (DEPRECATED)
 *
 * POST body:
 *   category, orgName, budgetRange, region, subcat_main (categorical)
 *   budget_log, bsisAmt_log, lwltRate, month, season_q, year, weekday,
 *   days_to_deadline, aValueTotal_log, has_avalue,
 *   org_avg_bidders, category_avg_bidders (numeric)
 *
 * Response:
 *   predicted_bidders: number  (1~500)
 *   model_version: string
 */
import { NextRequest, NextResponse } from "next/server";
import * as ort from "onnxruntime-web";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const ML_DIR = path.join(process.cwd(), "ml");
const MODEL_PATH = path.join(ML_DIR, "participants_lgbm.onnx");
const META_PATH = path.join(ML_DIR, "participants_lgbm_meta.json");

interface Metadata {
  encoders: Record<string, Record<string, number>>;
  feature_names: string[];
  categorical_cols: string[];
  numeric_cols: string[];
  model_version: string;
  metrics?: Record<string, number>;
}

ort.env.wasm.numThreads = 1;

let session: ort.InferenceSession | null = null;
let metadata: Metadata | null = null;
let initError: string | null = null;

async function init(): Promise<void> {
  if (session && metadata) return;
  try {
    if (!metadata) {
      const raw = fs.readFileSync(META_PATH, "utf8");
      metadata = JSON.parse(raw) as Metadata;
    }
    if (!session) {
      const buf = fs.readFileSync(MODEL_PATH);
      session = await ort.InferenceSession.create(buf);
    }
  } catch (err) {
    initError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw err;
  }
}

export async function GET() {
  try {
    await init();
    return NextResponse.json({
      status: "ok",
      model_version: metadata!.model_version,
      feature_count: metadata!.feature_names.length,
      metrics: metadata!.metrics ?? {},
    });
  } catch {
    return NextResponse.json({ status: "error", error: initError }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await init();
  } catch {
    return NextResponse.json({ error: `init failed: ${initError}` }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

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
    pred = Math.max(1, Math.min(500, pred));
    return NextResponse.json({
      predicted_bidders: Math.round(pred),
      predicted_bidders_float: Math.round(pred * 100) / 100,
      model_version: meta.model_version,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `predict failed: ${msg}` }, { status: 500 });
  }
}
