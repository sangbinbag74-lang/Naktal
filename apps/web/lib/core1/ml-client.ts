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
  subcat_main?: string;
  month: number;
  year: number;
  weekday?: number;
  is_quarter_end?: number;
  is_year_end?: number;
  season_q: number;
  budget_log: number;
  numBidders: number;
  stat_avg: number;
  stat_stddev: number;
  stat_p25: number;
  stat_p75: number;
  sampleSize: number;
  bidder_volatility: number;
  is_sparse_org: number;
  // v2 신규 (선택 — 호출자가 제공하면 정확도 향상, 미제공 시 route에서 global default)
  aValueTotal_log?: number;
  aValue_ratio?: number;
  has_avalue?: number;
  bsisAmt_log?: number;
  bsis_to_budget?: number;
  lwltRate?: number;
  rsrvtn_bgn?: number;
  rsrvtn_end?: number;
  has_prestdrd?: number;
  chg_count?: number;
  // expanding mean 프록시 (SajungRateStat 값 전달 가능)
  org_past_mean?: number;
  org_past_std?: number;
  org_past_cnt?: number;
  cat_past_mean?: number;
  cat_past_std?: number;
  cat_past_cnt?: number;
  reg_past_mean?: number;
  reg_past_std?: number;
  reg_past_cnt?: number;
  bud_past_mean?: number;
  bud_past_std?: number;
  bud_past_cnt?: number;
  sub_past_mean?: number;
  sub_past_std?: number;
  sub_past_cnt?: number;
  orgcat_past_mean?: number;
  orgcat_past_std?: number;
  orgcat_past_cnt?: number;
  catreg_past_mean?: number;
  catreg_past_std?: number;
  catreg_past_cnt?: number;
  orgbud_past_mean?: number;
  orgbud_past_std?: number;
  orgbud_past_cnt?: number;
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
 * v1 (16 피처) → v2 (27 피처) 점진 전환은 route.ts 측에서 처리.
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

// ─── Model 2: 복수예가 번호 선택 예측 ──────────────────────────────────────────

export interface OpeningMlFeatures {
  category: string;
  orgName: string;
  budgetRange: string;
  region: string;
  subcat_main: string;
  budget_log: number;
  bsisAmt_log: number;
  lwltRate: number;
  month: number;
  season_q: number;
  year: number;
  numBidders: number;
  aValueTotal_log: number;
  has_avalue: number;
}

export interface OpeningPrediction {
  probs: number[];       // 15개 확률
  top4: number[];        // 상위 4개 번호 (1~15)
  model_version: string;
}

export async function fetchMlOpening(features: OpeningMlFeatures): Promise<OpeningPrediction | null> {
  if (!ML_ENABLED) return null;
  const url = `${getBaseUrl()}/api/ml-predict-numbers`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ML_API_KEY ? { "X-API-Key": ML_API_KEY } : {}),
      },
      body: JSON.stringify(features),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as OpeningPrediction & { error?: string };
    if (data.error || !Array.isArray(data.probs) || data.probs.length !== 15) return null;
    return data;
  } catch {
    return null;
  }
}

// ─── Model 3: 참여자수 예측 (DEPRECATED 2026-04-24) ──────────────────────────
// RMSE 59명, 실용 불가로 배포 포기.
// memory/project_ml_model3_abandoned.md 참조. 코드 보존, UI 미호출.

export interface ParticipantsMlFeatures {
  category: string;
  orgName: string;
  budgetRange: string;
  region: string;
  subcat_main: string;
  budget_log: number;
  bsisAmt_log: number;
  lwltRate: number;
  month: number;
  season_q: number;
  year: number;
  weekday: number;
  days_to_deadline: number;
  aValueTotal_log: number;
  has_avalue: number;
  org_avg_bidders: number;
  category_avg_bidders: number;
}

export async function fetchMlParticipants(features: ParticipantsMlFeatures): Promise<number | null> {
  if (!ML_ENABLED) return null;
  const url = `${getBaseUrl()}/api/ml-predict-participants`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ML_API_KEY ? { "X-API-Key": ML_API_KEY } : {}),
      },
      body: JSON.stringify(features),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { predicted_bidders?: number };
    const n = Number(data.predicted_bidders);
    if (!Number.isFinite(n) || n < 1 || n > 500) return null;
    return Math.round(n);
  } catch {
    return null;
  }
}
