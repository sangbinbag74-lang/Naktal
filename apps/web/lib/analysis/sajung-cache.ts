import { createAdminClient } from "@/lib/supabase/server";

const CACHE_TTL_DAYS = 7;

export async function getCachedAnalysis(
  annId: string,
  period: string,
  cacheType: "histogram" | "trend" | "trend_v2" | "topten",
  userId = "",
): Promise<Record<string, unknown> | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("SajungAnalysisCache")
    .select("result, updatedAt, sampleSize")
    .eq("annId", annId)
    .eq("period", period)
    .eq("cacheType", cacheType)
    .eq("userId", userId)
    .maybeSingle();

  if (!data) return null;

  const age = Date.now() - new Date(data.updatedAt as string).getTime();
  if (age > CACHE_TTL_DAYS * 24 * 60 * 60 * 1000) return null;

  return data.result as Record<string, unknown>;
}

export async function setCachedAnalysis(
  annId: string,
  period: string,
  cacheType: "histogram" | "trend" | "trend_v2" | "topten",
  result: unknown,
  sampleSize: number,
  userId = "",
): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("SajungAnalysisCache")
    .upsert(
      {
        annId,
        period,
        cacheType,
        userId,
        result,
        sampleSize,
        updatedAt: new Date().toISOString(),
      },
      { onConflict: "annId,period,cacheType,userId" },
    );
}

/** 기간 문자열 → 시작 날짜 (null = 전체 기간) */
export function periodToDate(period: string): string | null {
  const now = new Date();
  switch (period) {
    case "1y": now.setFullYear(now.getFullYear() - 1); return now.toISOString();
    case "2y": now.setFullYear(now.getFullYear() - 2); return now.toISOString();
    case "3y": now.setFullYear(now.getFullYear() - 3); return now.toISOString();
    default: return null; // "all"
  }
}
