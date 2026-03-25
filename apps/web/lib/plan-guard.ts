import { Plan } from "@naktal/types";
import { createAdminClient } from "@/lib/supabase/server";

export enum Feature {
  CORE1_NUMBER_RECOMMEND    = "CORE1_NUMBER_RECOMMEND",
  CORE2_REALTIME_MONITOR    = "CORE2_REALTIME_MONITOR",
  CORE3_QUALIFICATION_BASIC = "CORE3_QUALIFICATION_BASIC",
  CORE3_QUALIFICATION_FULL  = "CORE3_QUALIFICATION_FULL",
  UNLIMITED_ALERTS          = "UNLIMITED_ALERTS",
}

// 월 사용 한도 (Infinity = 무제한)
const MONTHLY_LIMITS: Record<Plan, Record<Feature, number>> = {
  FREE: {
    [Feature.CORE1_NUMBER_RECOMMEND]:    3,
    [Feature.CORE2_REALTIME_MONITOR]:    0,
    [Feature.CORE3_QUALIFICATION_BASIC]: Infinity,
    [Feature.CORE3_QUALIFICATION_FULL]:  0,
    [Feature.UNLIMITED_ALERTS]:          0,
  },
  STANDARD: {
    [Feature.CORE1_NUMBER_RECOMMEND]:    30,
    [Feature.CORE2_REALTIME_MONITOR]:    0,
    [Feature.CORE3_QUALIFICATION_BASIC]: Infinity,
    [Feature.CORE3_QUALIFICATION_FULL]:  Infinity,
    [Feature.UNLIMITED_ALERTS]:          Infinity,
  },
  PRO: {
    [Feature.CORE1_NUMBER_RECOMMEND]:    Infinity,
    [Feature.CORE2_REALTIME_MONITOR]:    Infinity,
    [Feature.CORE3_QUALIFICATION_BASIC]: Infinity,
    [Feature.CORE3_QUALIFICATION_FULL]:  Infinity,
    [Feature.UNLIMITED_ALERTS]:          Infinity,
  },
};

export function canAccess(userPlan: Plan, feature: Feature): boolean {
  return (MONTHLY_LIMITS[userPlan]?.[feature] ?? 0) > 0;
}

export function getLimit(userPlan: Plan, feature: Feature): number {
  return MONTHLY_LIMITS[userPlan]?.[feature] ?? 0;
}

/** CORE1 이번 달 사용 횟수 조회 */
export async function checkUsageLimit(
  userId: string,
  feature: Feature,
  plan: Plan,
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const limit = getLimit(plan, feature);
  if (limit === 0) return { allowed: false, used: 0, limit: 0 };
  if (limit === Infinity) return { allowed: true, used: 0, limit: Infinity };

  // 이번 달 1일 00:00 KST
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const supabase = createAdminClient();
  const { count } = await supabase
    .from("NumberRecommendation")
    .select("*", { count: "exact", head: true })
    .eq("userId", userId)
    .gte("createdAt", startOfMonth.toISOString());

  const used = count ?? 0;
  return { allowed: used < limit, used, limit };
}
