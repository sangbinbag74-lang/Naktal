import { Plan } from "@naktal/types";

export enum Feature {
  REALTIME_ALERT = "REALTIME_ALERT",
  AI_RECOMMEND = "AI_RECOMMEND",
  PREEPRICE_ANALYSIS = "PREEPRICE_ANALYSIS",
  COMPETITOR_WATCH = "COMPETITOR_WATCH",
  UNLIMITED_ALERTS = "UNLIMITED_ALERTS",
}

const PLAN_FEATURES: Record<Plan, Feature[]> = {
  FREE: [],
  STANDARD: [Feature.REALTIME_ALERT, Feature.UNLIMITED_ALERTS],
  PRO: [
    Feature.REALTIME_ALERT,
    Feature.AI_RECOMMEND,
    Feature.PREEPRICE_ANALYSIS,
    Feature.COMPETITOR_WATCH,
    Feature.UNLIMITED_ALERTS,
  ],
};

export function canAccess(userPlan: Plan, feature: Feature): boolean {
  return PLAN_FEATURES[userPlan]?.includes(feature) ?? false;
}
