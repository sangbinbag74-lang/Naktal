import type { Plan } from "@naktal/types";

// 5티어 (2026-07-09 박상빈님 확정): FREE / LITE 9,900 / PRO 19,900⭐ / BIZ 49,900 / MASTER 99,000
//  - 수수료 전면 폐지, 구독 단일 수익. 기존 사용자는 grandfathered=true + plan=PRO (영구).
//  - STANDARD = 레거시 (LITE 동급 취급)
export enum Feature {
  CORE1_NUMBER_RECOMMEND = "CORE1_NUMBER_RECOMMEND", // 정밀 추천(투찰가+번호) 월 크레딧
  REALTIME_MONITOR = "REALTIME_MONITOR",             // 실시간 참여자 모니터
  COMPETITOR_TRACKING = "COMPETITOR_TRACKING",       // 경쟁사 추적 알림 — 전 티어 (개수 차등, 7/9 명시)
  TEAM_SEATS = "TEAM_SEATS",                         // 팀 계정 수
  ALERTS = "ALERTS",                                 // 공고 조건 알림 등록 개수
}

/**
 * 전면 무료 개방 (2026-09-03 박상빈님 확정).
 *  - true  = FREE 티어가 PRO 급 한도로 개방된다. 결제 없이 전 기능 이용 가능.
 *  - false = 기존 5티어 한도로 즉시 복귀한다.
 * 되돌릴 때는 이 상수만 false 로 바꾸면 된다. 다른 파일은 손대지 않는다.
 * 주의: AI 원본값(isOriginValuePlan)은 개방 대상이 아니다 — FREE 는 개인화 보정값을
 *       계속 받는다(사용자별 추천 다양화 유지). ML 산출 로직은 일절 건드리지 않았다.
 */
export const FREE_OPEN_ALL = true;

const FREE_LIMITS_OPEN: Record<Feature, number> = {
  [Feature.CORE1_NUMBER_RECOMMEND]: Infinity, // 무제한 (개인화 보정값 유지)
  [Feature.REALTIME_MONITOR]: Infinity,
  [Feature.COMPETITOR_TRACKING]: Infinity,
  [Feature.TEAM_SEATS]: 1,
  [Feature.ALERTS]: Infinity,
};

const FREE_LIMITS_TIERED: Record<Feature, number> = {
  [Feature.CORE1_NUMBER_RECOMMEND]: 3, // 월 3건 (개인화 보정값)
  [Feature.REALTIME_MONITOR]: 0,
  [Feature.COMPETITOR_TRACKING]: 1,
  [Feature.TEAM_SEATS]: 1,
  [Feature.ALERTS]: 3,
};

// 월 사용 한도 (Infinity = 무제한, 0 = 접근 불가)
const MONTHLY_LIMITS: Record<Plan, Record<Feature, number>> = {
  FREE: FREE_OPEN_ALL ? FREE_LIMITS_OPEN : FREE_LIMITS_TIERED,
  STANDARD: {
    // 레거시 → LITE 동급
    [Feature.CORE1_NUMBER_RECOMMEND]: Infinity,
    [Feature.REALTIME_MONITOR]: 0,
    [Feature.COMPETITOR_TRACKING]: 3,
    [Feature.TEAM_SEATS]: 1,
    [Feature.ALERTS]: 10,
  },
  LITE: {
    [Feature.CORE1_NUMBER_RECOMMEND]: Infinity, // 무제한 (개인화 보정값)
    [Feature.REALTIME_MONITOR]: 0,
    [Feature.COMPETITOR_TRACKING]: 3,
    [Feature.TEAM_SEATS]: 1,
    [Feature.ALERTS]: 10,
  },
  PRO: {
    [Feature.CORE1_NUMBER_RECOMMEND]: Infinity, // 무제한 + AI 원본값
    [Feature.REALTIME_MONITOR]: Infinity,
    [Feature.COMPETITOR_TRACKING]: 5,
    [Feature.TEAM_SEATS]: 1,
    [Feature.ALERTS]: Infinity,
  },
  BIZ: {
    [Feature.CORE1_NUMBER_RECOMMEND]: Infinity,
    [Feature.REALTIME_MONITOR]: Infinity,
    [Feature.COMPETITOR_TRACKING]: 10,
    [Feature.TEAM_SEATS]: 3,
    [Feature.ALERTS]: Infinity,
  },
  MASTER: {
    [Feature.CORE1_NUMBER_RECOMMEND]: Infinity,
    [Feature.REALTIME_MONITOR]: Infinity,
    [Feature.COMPETITOR_TRACKING]: Infinity,
    [Feature.TEAM_SEATS]: 5,
    [Feature.ALERTS]: Infinity,
  },
};

export function canAccess(userPlan: Plan, feature: Feature): boolean {
  return (MONTHLY_LIMITS[userPlan]?.[feature] ?? 0) > 0;
}

export function getLimit(userPlan: Plan, feature: Feature): number {
  return MONTHLY_LIMITS[userPlan]?.[feature] ?? 0;
}

/** 유료 구독 티어 여부 (광고 제거 대상) */
export function isPaidPlan(userPlan: Plan): boolean {
  return userPlan !== "FREE";
}

/**
 * AI 원본값(노이즈·개인화 보정 0) 제공 티어 — 박상빈님 7/9 a안.
 *  PRO 이상 = band 중심 운영점 그대로 / FREE·LITE = userHash 개인화 보정값.
 */
export function isOriginValuePlan(userPlan: Plan): boolean {
  return userPlan === "PRO" || userPlan === "BIZ" || userPlan === "MASTER";
}

/** 월간 가격 (원, 표시용) */
export const PLAN_PRICES: Record<Plan, number> = {
  FREE: 0,
  STANDARD: 9900, // 레거시
  LITE: 9900,
  PRO: 19900,
  BIZ: 49900,
  MASTER: 99000,
};

/** 연납 가격 (원, 2개월 무료) */
export const PLAN_PRICES_YEARLY: Record<Plan, number> = {
  FREE: 0,
  STANDARD: 99000,
  LITE: 99000,
  PRO: 199000,
  BIZ: 499000,
  MASTER: 990000,
};

export const PLAN_LABELS: Record<Plan, string> = {
  FREE: "무료",
  STANDARD: "라이트(구)",
  LITE: "라이트",
  PRO: "프로",
  BIZ: "비즈",
  MASTER: "마스터",
};
