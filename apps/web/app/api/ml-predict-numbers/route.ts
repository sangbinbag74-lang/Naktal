/**
 * Model 2 — 복수예가 번호 선택 예측 API
 *
 * 15개 ONNX booster 로드 → 각 번호(1~15) 선택 확률 반환
 *
 * POST body:
 *   category, orgName, budgetRange, region, subcat_main (categorical)
 *   budget_log, bsisAmt_log, lwltRate, month, season_q, year,
 *   numBidders, aValueTotal_log, has_avalue (numeric)
 *
 * Response:
 *   probs: number[15]       — 각 번호 선택 확률
 *   top4: number[4]         — 확률 상위 4개 번호 (1~15)
 *   model_version: string
 */
import { NextRequest, NextResponse } from "next/server";
import * as ort from "onnxruntime-web";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const ML_DIR = path.join(process.cwd(), "ml", "opening");
const META_PATH = path.join(ML_DIR, "meta.json");
const N_NUMBERS = 15;

interface Metadata {
  encoders: Record<string, Record<string, number>>;
  feature_names: string[];
  categorical_cols: string[];
  numeric_cols: string[];
  n_numbers: number;
  model_version: string;
  metrics?: Record<string, number>;
}

ort.env.wasm.numThreads = 1;

let sessions: (ort.InferenceSession | null)[] = [];
let metadata: Metadata | null = null;
let initError: string | null = null;

async function init(): Promise<void> {
  if (sessions.length === N_NUMBERS && metadata) return;
  try {
    if (!metadata) {
      const raw = fs.readFileSync(META_PATH, "utf8");
      metadata = JSON.parse(raw) as Metadata;
    }
    sessions = [];
    for (let i = 0; i < N_NUMBERS; i++) {
      const onnxPath = path.join(ML_DIR, `sel_${i + 1}.onnx`);
      if (!fs.existsSync(onnxPath)) {
        sessions.push(null);
        continue;
      }
      const buf = fs.readFileSync(onnxPath);
      const s = await ort.InferenceSession.create(buf);
      sessions.push(s);
    }
  } catch (err) {
    initError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw err;
  }
}

export async function GET() {
  try {
    await init();
    const loaded = sessions.filter(s => s !== null).length;
    return NextResponse.json({
      status: "ok",
      model_version: metadata!.model_version,
      loaded_boosters: loaded,
      n_numbers: N_NUMBERS,
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

  // 피처 벡터 구성 (Float32Array)
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
    const probs: number[] = [];
    for (let i = 0; i < N_NUMBERS; i++) {
      const s = sessions[i];
      if (!s) {
        probs.push(4 / 15);
        continue;
      }
      const feeds: Record<string, ort.Tensor> = {};
      feeds[s.inputNames[0]!] = tensor;
      const out = await s.run(feeds);
      // LightGBM binary output: probability [1-p, p] or direct p
      const outName = s.outputNames[0]!;
      const outData = out[outName]!.data as Float32Array;
      // [prob_class_0, prob_class_1] 또는 단일 값
      const p = outData.length >= 2 ? outData[1]! : outData[0]!;
      probs.push(Math.max(0, Math.min(1, p)));
    }
    // 상위 4개 번호 (1~15)
    const idx = probs
      .map((p, i) => ({ i: i + 1, p }))
      .sort((a, b) => b.p - a.p)
      .slice(0, 4)
      .map(x => x.i);

    return NextResponse.json({
      probs: probs.map(p => Math.round(p * 10000) / 10000),
      top4: idx,
      model_version: meta.model_version,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `predict failed: ${msg}` }, { status: 500 });
  }
}
