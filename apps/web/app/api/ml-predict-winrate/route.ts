/**
 * 낙찰선(winRate) 직접예측 API — 2026-06-09 (전체 입찰자 데이터 기반)
 *
 * 타겟 = 마진(낙찰선 투찰률 − 낙찰하한율). 호출측(sajung-engine)에서:
 *   추천 투찰률 = margin + lwlt + 규모적응 band offset(사용자 hash)
 * feature(6, 모두 숫자) = [year, month, instt_te, log_bss, log_presmpt, lwlt]
 *   - instt_te = 발주처별 과거 평균 마진 (sajung-engine이 winrate_te_map.json 조회 후 전달)
 * 실패 시 호출측은 기존 사정율 경로로 폴백.
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
ort.env.wasm.wasmPaths = {
  wasm: `file://${path.join(ML_DIR, "ort-wasm-simd-threaded.wasm").replace(/\\/g, "/")}`,
  mjs: `file://${path.join(ML_DIR, "ort-wasm-simd-threaded.mjs").replace(/\\/g, "/")}`,
};
ort.env.wasm.numThreads = 1;

const FEATURES = ["year", "month", "instt_te", "log_bss", "log_presmpt", "lwlt"] as const;

let sessionPromise: Promise<ort.InferenceSession> | null = null;
function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const data = fs.readFileSync(path.join(ML_DIR, "winrate_q50.onnx"));
      const buffer = new ArrayBuffer(data.byteLength);
      new Uint8Array(buffer).set(data);
      return await ort.InferenceSession.create(buffer);
    })();
    sessionPromise.catch(() => {
      sessionPromise = null;
    });
  }
  return sessionPromise;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!authOk(request)) {
    return NextResponse.json({ error: "invalid api key" }, { status: 401 });
  }
  try {
    const f = (await request.json()) as Record<string, unknown>;
    const arr = new Float32Array(FEATURES.length);
    for (let i = 0; i < FEATURES.length; i++) {
      const col = FEATURES[i] ?? "";
      const v = f[col];
      arr[i] = typeof v === "number" && Number.isFinite(v) ? v : 0;
    }
    const session = await getSession();
    const tensor = new ort.Tensor("float32", arr, [1, FEATURES.length]);
    const inputName = session.inputNames[0] ?? "input";
    const out = await session.run({ [inputName]: tensor });
    const outName = session.outputNames[0] ?? "";
    const margin = Number((out[outName]?.data as Float32Array | undefined)?.[0] ?? NaN);
    if (!Number.isFinite(margin)) {
      return NextResponse.json({ error: "inference failed" }, { status: 500 });
    }
    return NextResponse.json({ margin, model_version: "winrate-te-2026-06-09" });
  } catch (e) {
    captureError(e as Error, { route: "ml-predict-winrate" });
    console.error("[ml-predict-winrate] 오류:", (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: "ok", model: "winrate_q50", features: FEATURES });
}
