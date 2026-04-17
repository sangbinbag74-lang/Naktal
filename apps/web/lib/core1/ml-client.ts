/**
 * ML 예측 API 클라이언트 (Naktal ML — LightGBM 사정율 예측)
 *
 * Vercel Python Function 호출 (같은 Vercel 프로젝트 내 /api/ml-predict).
 * 타임아웃 3초, 실패 시 null 반환 (호출측에서 기존 통계 로직으로 폴백).
 *
 * 환경변수 (선택):
 *   NEXT_PUBLIC_SITE_URL  — 예: https://naktal.me (절대 URL 필요, 서버 측 fetch 기준)
 *   ML_API_KEY            — 인증 키 (Python 함수와 동일 값)
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

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

const ML_API_KEY = process.env.ML_API_KEY ?? "";
const ML_ENABLED = process.env.ML_ENABLED !== "false"; // 기본 활성, false로 비활성

/**
 * ML 서버에 사정율 예측 요청. 실패 시 null 반환.
 */
export async function fetchMlSajung(features: MlFeatures): Promise<number | null> {
  if (!ML_ENABLED) return null;

  const url = `${getBaseUrl()}/api/ml-predict`;

  try {
    const res = await fetch(url, {
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
