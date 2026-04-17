/**
 * ML 예측 API 클라이언트 (Naktal ML — LightGBM 사정율 예측)
 *
 * Railway에 호스팅된 FastAPI 서버 호출.
 * 타임아웃 3초, 실패 시 null 반환 (호출측에서 기존 통계 로직으로 폴백).
 *
 * 환경변수:
 *   ML_API_URL   — 예: https://naktal-ml.up.railway.app
 *   ML_API_KEY   — 인증 키
 */

export interface MlFeatures {
  category: string;
  orgName: string;
  budgetRange: string;
  region: string;
  month: number;
  year: number;
  budget_log: number;
  numBidders: number;
  stat_avg: number;
  stat_stddev: number;
  stat_p25: number;
  stat_p75: number;
  sampleSize: number;
  bidder_volatility: number;
  is_sparse_org: number;
  season_q: number;
}

const ML_API_URL = process.env.ML_API_URL ?? "";
const ML_API_KEY = process.env.ML_API_KEY ?? "";

/**
 * ML 서버에 사정율 예측 요청. 실패 시 null 반환.
 */
export async function fetchMlSajung(features: MlFeatures): Promise<number | null> {
  if (!ML_API_URL) return null;

  try {
    const res = await fetch(`${ML_API_URL}/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ML_API_KEY ? { "X-API-Key": ML_API_KEY } : {}),
      },
      body: JSON.stringify(features),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { predicted_sajung_rate?: number };
    const rate = Number(data.predicted_sajung_rate);
    if (!Number.isFinite(rate) || rate < 85 || rate > 115) return null;
    return rate;
  } catch {
    return null;
  }
}
