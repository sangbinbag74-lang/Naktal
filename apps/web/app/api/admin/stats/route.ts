import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const supabase = await createClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const [
    totalUsers,
    paidUsers,
    newUsersMonth,
    totalAnn,
    todayCrawl,
    recentCrawlLogs,
    signupTrend,
    monthSubs,
  ] = await Promise.all([
    // 전체 가입자
    supabase.from("User").select("*", { count: "exact", head: true }).eq("isActive", true),
    // 유료 구독자
    supabase.from("User").select("*", { count: "exact", head: true }).neq("plan", "FREE").eq("isActive", true),
    // 이번 달 신규 가입
    supabase.from("User").select("*", { count: "exact", head: true }).gte("createdAt", monthStart),
    // 총 공고 수집
    supabase.from("Announcement").select("*", { count: "exact", head: true }).is("deletedAt", null),
    // 오늘 크롤링 실행 횟수
    supabase.from("CrawlLog").select("*", { count: "exact", head: true }).gte("runAt", todayStart),
    // 최근 크롤링 로그 10건
    supabase.from("CrawlLog").select("id,runAt,type,status,count,errors").order("runAt", { ascending: false }).limit(10),
    // 최근 7일 가입자 추이
    supabase.from("User").select("createdAt").gte("createdAt", new Date(now.getTime() - 7 * 86400000).toISOString()),
    // 이번 달 결제 금액
    supabase.from("Subscription").select("plan,createdAt").eq("status", "ACTIVE").gte("createdAt", monthStart),
  ]);

  // 7일 추이 집계
  const trendMap: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    trendMap[d.toISOString().slice(0, 10)] = 0;
  }
  for (const u of (signupTrend.data ?? []) as { createdAt: string }[]) {
    const day = u.createdAt.slice(0, 10);
    if (day in trendMap) trendMap[day] = (trendMap[day] ?? 0) + 1;
  }
  const signupTrendArr = Object.entries(trendMap).map(([date, count]) => ({ date, count }));

  // 이번 달 매출 추정
  const PLAN_PRICES: Record<string, number> = { STANDARD: 99000, PRO: 199000 };
  const monthRevenue = (monthSubs.data ?? []).reduce(
    (sum, s) => sum + (PLAN_PRICES[(s as { plan: string }).plan] ?? 0),
    0
  );

  return NextResponse.json({
    totalUsers: totalUsers.count ?? 0,
    paidUsers: paidUsers.count ?? 0,
    newUsersMonth: newUsersMonth.count ?? 0,
    monthRevenue,
    totalAnnouncements: totalAnn.count ?? 0,
    todayCrawlCount: todayCrawl.count ?? 0,
    signupTrend: signupTrendArr,
    recentCrawlLogs: recentCrawlLogs.data ?? [],
  });
}
