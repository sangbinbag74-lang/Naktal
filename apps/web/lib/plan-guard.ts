import type { Plan } from "@naktal/types";

export enum Feature {
  CORE1_NUMBER_RECOMMEND = "CORE1_NUMBER_RECOMMEND",
}

// 월 사용 한도 (Infinity = 무제한, 0 = 접근 불가)
const MONTHLY_LIMITS: Record<Plan, Record<Feature, number>> = {
  FREE: {
    [Feature.CORE1_NUMBER_RECOMMEND]: 0,
  },
  STANDARD: {
    // 기존 스탠다드 유저 → 프로와 동일 취급
    [Feature.CORE1_NUMBER_RECOMMEND]: Infinity,
  },
  PRO: {
    [Feature.CORE1_NUMBER_RECOMMEND]: Infinity,
  },
};

export function canAccess(userPlan: Plan, feature: Feature): boolean {
  return (MONTHLY_LIMITS[userPlan]?.[feature] ?? 0) > 0;
}

export function getLimit(userPlan: Plan, feature: Feature): number {
  return MONTHLY_LIMITS[userPlan]?.[feature] ?? 0;
}
