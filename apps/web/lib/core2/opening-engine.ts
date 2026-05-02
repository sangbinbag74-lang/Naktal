/**
 * CORE 2 ML: 복수예가 번호 선택 예측 엔진
 *
 * Model 2 (LightGBM 15개 booster, ONNX) 호출 → 15개 번호 선택 확률
 * 기존 frequency-engine (통계 빈도) 과 가중 blend 가능.
 *
 * 사용:
 *   const ml = await predictOpeningNumbers({ annId, ... });
 *   if (ml) { ... }  // null이면 통계로 폴백
 */
import { fetchMlOpening, type OpeningMlFeatures, type OpeningPrediction } from "../core1/ml-client";

export interface OpeningContext {
  category: string;
  orgName: string;
  region: string;
  budget: number;
  bsisAmt: number;
  lwltRate: number;
  deadline: Date;
  subCategories: string[];
  numBidders: number;
  aValueTotal: number;
}

function budgetRange(budget: number): string {
  if (budget < 100_000_000) return "1억미만";
  if (budget < 300_000_000) return "1억-3억";
  if (budget < 1_000_000_000) return "3억-10억";
  if (budget < 3_000_000_000) return "10억-30억";
  return "30억이상";
}

function toFeatures(ctx: OpeningContext): OpeningMlFeatures {
  const month = ctx.deadline.getMonth() + 1;
  const season_q = month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4;
  const year = ctx.deadline.getFullYear();
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
    numBidders: ctx.numBidders || 0,
    aValueTotal_log: ctx.aValueTotal > 0 ? Math.log(ctx.aValueTotal + 1) : 0,
    has_avalue: ctx.aValueTotal > 0 ? 1 : 0,
  };
}

/**
 * ML 복수예가 번호 예측. 실패 시 null.
 */
export async function predictOpeningNumbers(ctx: OpeningContext): Promise<OpeningPrediction | null> {
  const features = toFeatures(ctx);
  return fetchMlOpening(features);
}

/**
 * ML 확률 + 기존 frequency freqMap (통계) 가중 blend
 *   mlWeight: ML 가중치 (0~1), 기본 0
 *
 * 2026-04-30: Model 2 (복수예가 번호 선택) 8개 변형 실험 결과
 * 모두 freq baseline 0.326 천장 동일 (LGBM/CatBoost/KNN/KoBERT/recent TE).
 * val/test (org,cat) self-oracle 천장 0.349 vs train→val 전이 = 0.326 차이
 * = 학습 가능 신호가 train→val 전이 시 손실. 데이터 본질적 한계.
 * → ML 가중치 기본 0, freqMap 단독 사용. mlProbs는 호출자 지정 시에만 활성.
 *
 * freqMap은 번호(1~15) → 선택 빈도 [0,1].
 * 반환: 번호(1~15) → 조합된 선택 확률.
 */
export function blendWithFrequency(
  mlProbs: number[] | null,
  freqMap: Record<number, number> | null,
  mlWeight = 0,
): number[] {
  const result = new Array(15).fill(4 / 15);
  for (let i = 0; i < 15; i++) {
    const ml = mlProbs?.[i];
    const stat = freqMap?.[i + 1];
    if (ml != null && stat != null) {
      result[i] = mlWeight * ml + (1 - mlWeight) * stat;
    } else if (ml != null) {
      result[i] = ml;
    } else if (stat != null) {
      result[i] = stat;
    }
  }
  return result;
}
