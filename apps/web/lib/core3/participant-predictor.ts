/**
 * CORE 3 ML: 참여자수 예측 엔진
 *
 * ⚠️ 2026-04-24 배포 포기 — RMSE 59명, 실용 불가 판정
 *    memory/project_ml_model3_abandoned.md 참조
 *    현재 어떤 UI/API에서도 호출하지 않음. 코드 보존 (분류 모델 재설계 시 참고)
 *
 * Model 3 (LightGBM regression, ONNX) 호출 → 예상 참여자 수
 * 공고 직후부터 사용 가능 (기존 실시간 크롤링 대체/보조)
 *
 * 사용 (deprecated):
 *   const n = await predictParticipants({ annId, ... });
 *   if (n != null) { ... }
 */
import { fetchMlParticipants, type ParticipantsMlFeatures } from "../core1/ml-client";

export interface ParticipantContext {
  category: string;
  orgName: string;
  region: string;
  budget: number;
  bsisAmt: number;
  lwltRate: number;
  deadline: Date;
  bidNtceDt?: Date;        // 공고일자 (있으면 days_to_deadline 계산)
  subCategories: string[];
  aValueTotal: number;
  orgAvgBidders?: number;   // 해당 발주처 과거 평균 (없으면 0 → server-side default)
  categoryAvgBidders?: number;
}

function budgetRange(budget: number): string {
  if (budget < 100_000_000) return "1억미만";
  if (budget < 300_000_000) return "1억-3억";
  if (budget < 1_000_000_000) return "3억-10억";
  if (budget < 3_000_000_000) return "10억-30억";
  return "30억이상";
}

function toFeatures(ctx: ParticipantContext): ParticipantsMlFeatures {
  const month = ctx.deadline.getMonth() + 1;
  const season_q = month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4;
  const year = ctx.deadline.getFullYear();
  const weekday = ctx.deadline.getDay();
  const daysToDeadline = ctx.bidNtceDt
    ? Math.max(1, Math.round((ctx.deadline.getTime() - ctx.bidNtceDt.getTime()) / 86400000))
    : 7;

  return {
    category: ctx.category,
    orgName: ctx.orgName,
    budgetRange: budgetRange(ctx.budget),
    region: ctx.region || "전국",
    subcat_main: ctx.subCategories?.[0] ?? "",
    budget_log: ctx.budget > 0 ? Math.log(ctx.budget + 1) : 0,
    bsisAmt_log: ctx.bsisAmt > 0 ? Math.log(ctx.bsisAmt + 1) : 0,
    lwltRate: ctx.lwltRate || 87.745,
    month,
    season_q,
    year,
    weekday,
    days_to_deadline: daysToDeadline,
    aValueTotal_log: ctx.aValueTotal > 0 ? Math.log(ctx.aValueTotal + 1) : 0,
    has_avalue: ctx.aValueTotal > 0 ? 1 : 0,
    org_avg_bidders: ctx.orgAvgBidders ?? 0,
    category_avg_bidders: ctx.categoryAvgBidders ?? 0,
  };
}

export async function predictParticipants(ctx: ParticipantContext): Promise<number | null> {
  const features = toFeatures(ctx);
  return fetchMlParticipants(features);
}
