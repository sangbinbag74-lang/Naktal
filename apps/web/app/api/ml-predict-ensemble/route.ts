/**
 * Ensemble 사정율 예측 API — Phase 2+3+4 결합
 *
 * 구조:
 *   1) 사정율 quantile q05/q50/q95 (Phase 2, LightGBM) — 번들 로드
 *   2) 1순위 lowerlimit q05/q50/q95 (Phase 3, LightGBM) — GitHub Release fetch + cache
 *   3) 메타 q95 (Phase 4, XGBoost) — 위 6개 결과 + 11개 피처 → 최종 사정율
 *
 * 응답:
 *   {
 *     ensemble_sajung_q05, ensemble_sajung_q50, ensemble_sajung_q95,
 *     recommended_sajung_rate (= q95, 적격 95% 통과 안전선)
 *   }
 *
 * 모델 손실 시 호출측 (sajung-engine)에서 Phase 1 σ × z 폴백 자동 발동.
 */
import { NextRequest, NextResponse } from "next/server";
import * as ort from "onnxruntime-web";
import path from "path";
import fs from "fs";
import { captureError } from "@/lib/observability/sentry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // 첫 호출 시 lowerlimit 3개 fetch + ONNX init (185+188+59MB ≈ 30~50초)

const ML_DIR = path.join(process.cwd(), "ml");
const MANIFEST_PATH = path.join(ML_DIR, "ensemble_manifest.json");
const ENCODERS_PATH = path.join(ML_DIR, "ensemble_encoders.json");

interface Manifest {
  version: string;
  bundled_models: Record<string, string>;
  remote_models: Record<string, string>;
}

interface EncodersJson {
  encoders: Record<string, Record<string, number>>;
  models: {
    sajung_quantile: { feature_names: string[]; categorical_cols: string[] };
    lowerlimit: { feature_names: string[]; categorical_cols: string[] };
    ensemble_meta: { feature_names: string[]; categorical_cols: string[] };
  };
}

// onnxruntime-web WASM 경로 (기존 ml-predict 패턴 동일)
ort.env.wasm.wasmPaths = {
  wasm: `file://${path.join(ML_DIR, "ort-wasm-simd-threaded.wasm").replace(/\\/g, "/")}`,
  mjs: `file://${path.join(ML_DIR, "ort-wasm-simd-threaded.mjs").replace(/\\/g, "/")}`,
};
ort.env.wasm.numThreads = 1;

// 모듈 레벨 캐시 (warm start 재사용)
const sessionCache = new Map<string, Promise<ort.InferenceSession>>();
let manifestCache: Manifest | null = null;
let encodersCache: EncodersJson | null = null;

function getManifest(): Manifest {
  if (manifestCache) return manifestCache;
  manifestCache = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
  return manifestCache!;
}

function getEncoders(): EncodersJson {
  if (encodersCache) return encodersCache;
  encodersCache = JSON.parse(fs.readFileSync(ENCODERS_PATH, "utf-8"));
  return encodersCache!;
}

async function getSession(modelKey: string): Promise<ort.InferenceSession> {
  const cached = sessionCache.get(modelKey);
  if (cached) return cached;
  const manifest = getManifest();
  const promise = (async () => {
    let buffer: ArrayBuffer;
    const bundled = manifest.bundled_models[modelKey];
    const remote  = manifest.remote_models[modelKey];
    if (bundled) {
      const fname = bundled.replace("/ml/", "");
      const fullPath = path.join(ML_DIR, fname);
      const data = fs.readFileSync(fullPath);
      buffer = new ArrayBuffer(data.byteLength);
      new Uint8Array(buffer).set(data);
    } else if (remote) {
      console.log(`[Ensemble] fetching remote: ${modelKey} from ${remote}`);
      const t0 = Date.now();
      // Vercel Blob private store — token 헤더 + 같은 Vercel 인프라라 매우 빠름 (1~5초)
      const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
      const res = await fetch(remote, {
        signal: AbortSignal.timeout(20000),
        headers: blobToken ? { authorization: `Bearer ${blobToken}` } : {},
      });
      if (!res.ok) throw new Error(`Failed to fetch ${modelKey}: HTTP ${res.status}`);
      buffer = await res.arrayBuffer();
      console.log(`[Ensemble] ${modelKey} fetched (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB, ${Date.now() - t0}ms)`);
    } else {
      throw new Error(`Unknown model: ${modelKey}`);
    }
    return await ort.InferenceSession.create(buffer);
  })();
  // 실패한 Promise 는 cache 에서 제거 (재시도 가능하게) — Vercel cold start 회복용
  promise.catch(() => {
    sessionCache.delete(modelKey);
  });
  sessionCache.set(modelKey, promise);
  return promise;
}

function encodeFeature(value: unknown, encoder: Record<string, number> | undefined): number {
  if (!encoder) return 0;
  const v = String(value ?? "");
  return encoder[v] ?? 0;
}

function buildSajungInput(features: Record<string, unknown>, featureNames: string[], categoricalCols: string[]): Float32Array {
  const encs = getEncoders().encoders;
  const arr = new Float32Array(featureNames.length);
  for (let i = 0; i < featureNames.length; i++) {
    const col = featureNames[i] ?? "";
    if (categoricalCols.includes(col)) {
      arr[i] = encodeFeature(features[col], encs[col]);
    } else {
      const v = features[col];
      arr[i] = typeof v === "number" && Number.isFinite(v) ? v : 0;
    }
  }
  return arr;
}

async function runOne(modelKey: string, input: Float32Array, featureCount: number): Promise<number> {
  const session = await getSession(modelKey);
  const tensor = new ort.Tensor("float32", input, [1, featureCount]);
  const inputName = session.inputNames[0] ?? "input";
  const out = await session.run({ [inputName]: tensor });
  const outputName = session.outputNames[0] ?? "";
  const data = out[outputName]?.data as Float32Array;
  return Number(data?.[0] ?? 0);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const features = (await request.json()) as Record<string, unknown>;
    const encoders = getEncoders();

    // 1. 사정율 quantile q05/q50/q95 병렬
    const sajungFeatures = encoders.models.sajung_quantile.feature_names;
    const sajungCats = encoders.models.sajung_quantile.categorical_cols;
    const sajungInput = buildSajungInput(features, sajungFeatures, sajungCats);

    // 2. lowerlimit quantile q05/q50/q95 병렬 (피처 일부 다름)
    const lwltFeatures = encoders.models.lowerlimit.feature_names;
    const lwltCats = encoders.models.lowerlimit.categorical_cols;
    // lowerlimit 학습 시 expanding mean 이 winrate(BidResult.bidRate) 기준이지만,
    // 추론 시점에는 SajungRateStat 만 있으므로 stat_avg 등으로 폴백 매핑
    const lwltFeatureValues: Record<string, unknown> = {
      ...features,
      org_past_winrate_mean: features.org_past_mean ?? features.stat_avg ?? 0,
      org_past_winrate_std:  features.org_past_std  ?? features.stat_stddev ?? 0,
      org_past_winrate_cnt:  features.org_past_cnt  ?? features.sampleSize ?? 0,
      cat_past_winrate_mean: features.cat_past_mean ?? features.stat_avg ?? 0,
      cat_past_winrate_std:  features.cat_past_std  ?? features.stat_stddev ?? 0,
      cat_past_winrate_cnt:  features.cat_past_cnt  ?? features.sampleSize ?? 0,
    };
    const lwltInput = buildSajungInput(lwltFeatureValues, lwltFeatures, lwltCats);

    // 6개 quantile 병렬 추론
    const [sj_q05, sj_q50, sj_q95, lw_q05, lw_q50, lw_q95] = await Promise.all([
      runOne("sajung_quantile_q05", sajungInput, sajungFeatures.length),
      runOne("sajung_quantile_q50", sajungInput, sajungFeatures.length),
      runOne("sajung_quantile_q95", sajungInput, sajungFeatures.length),
      runOne("lowerlimit_q05",      lwltInput,   lwltFeatures.length),
      runOne("lowerlimit_q50",      lwltInput,   lwltFeatures.length),
      runOne("lowerlimit_q95",      lwltInput,   lwltFeatures.length),
    ]);

    // 3. 메타 q95 추론 — 11개 피처
    const metaFeatureNames = encoders.models.ensemble_meta.feature_names;
    const metaValues: Record<string, number> = {
      pred_sajung_q05: sj_q05,
      pred_sajung_q50: sj_q50,
      pred_sajung_q95: sj_q95,
      pred_lwlt_q05:   lw_q05,
      pred_lwlt_q50:   lw_q50,
      pred_lwlt_q95:   lw_q95,
      budget_log:    Number(features.budget_log ?? 0),
      lwltRate:      Number(features.lwltRate ?? 87.745),
      stat_stddev:   Number(features.stat_stddev ?? 0.7),
      sampleSize:    Number(features.sampleSize ?? 0),
      numBidders:    Number(features.numBidders ?? 30),
    };
    const metaInput = new Float32Array(metaFeatureNames.length);
    for (let i = 0; i < metaFeatureNames.length; i++) {
      const fname = metaFeatureNames[i] ?? "";
      metaInput[i] = metaValues[fname] ?? 0;
    }
    const meta_q95 = await runOne("ensemble_meta_q95", metaInput, metaFeatureNames.length);

    return NextResponse.json({
      ensemble_sajung_q05: sj_q05,
      ensemble_sajung_q50: sj_q50,
      ensemble_sajung_q95: sj_q95,
      ensemble_lwlt_q05: lw_q05,
      ensemble_lwlt_q50: lw_q50,
      ensemble_lwlt_q95: lw_q95,
      recommended_sajung_rate: meta_q95,  // 적격 95% 통과 안전선 (실제 1위 투찰률 q95)
      model_version: getManifest().version,
    });
  } catch (e) {
    captureError(e as Error, { route: "ml-predict-ensemble" });
    console.error("[ml-predict-ensemble] 오류:", (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const manifest = getManifest();
  const url = new URL(request.url);
  // ?debug=1 — 환경변수 + remote fetch 1건 테스트
  if (url.searchParams.get("debug") === "1") {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const testUrl = manifest.remote_models["lowerlimit_q95"];
    let fetchResult = "skipped";
    if (testUrl) {
      try {
        const t0 = Date.now();
        const res = await fetch(testUrl, {
          signal: AbortSignal.timeout(15000),
          headers: token ? { authorization: `Bearer ${token}` } : {},
        });
        const ms = Date.now() - t0;
        fetchResult = `HTTP ${res.status} in ${ms}ms (size=${res.headers.get("content-length") ?? "?"})`;
      } catch (e) {
        fetchResult = `ERROR: ${(e as Error).message}`;
      }
    }
    return NextResponse.json({
      status: "debug",
      has_blob_token: !!token,
      token_prefix: token ? token.slice(0, 20) + "..." : null,
      test_fetch_url: testUrl,
      test_fetch_result: fetchResult,
    });
  }
  return NextResponse.json({
    status: "ok",
    version: manifest.version,
    bundled: Object.keys(manifest.bundled_models),
    remote: Object.keys(manifest.remote_models),
    cached_sessions: Array.from(sessionCache.keys()),
  });
}
