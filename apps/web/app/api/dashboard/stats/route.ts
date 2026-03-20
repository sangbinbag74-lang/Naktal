import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PLAN_LIMITS: Record<string, number> = {
  FREE: 3,
  STANDARD: 30,
  PRO: -1,
};

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const d3later   = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();

  const [dbUser, core1This, annToday, annUrgent] = await Promise.all([
    // 유저 플랜
    supabase.from("User").select("plan").eq("supabaseId", user.id).single(),
    // 이번 달 CORE 1 사용량
    supabase.from("NumberRecommendation")
      .select("*", { count: "exact", head: true })
      .eq("userId", user.id)  // supabaseId가 아닌 User.id 필요 — 아래서 처리
      .gte("createdAt", monthStart),
    // 오늘 신규 공고
    supabase.from("Announcement")
      .select("*", { count: "exact", head: true })
      .gte("createdAt", todayStart),
    // 마감 임박 (D-3 이내)
    supabase.from("Announcement")
      .select("*", { count: "exact", head: true })
      .gte("deadline", now.toISOString())
      .lte("deadline", d3later),
  ]);

  const plan = dbUser.data?.plan ?? "FREE";
  const core1Limit = PLAN_LIMITS[plan] ?? 3;

  // NumberRecommendation은 User.id(cuid) 기준이므로 재조회
  let core1UsedThisMonth = 0;
  if (dbUser.data) {
    const { data: userId } = await supabase
      .from("User")
      .select("id")
      .eq("supabaseId", user.id)
      .single();

    if (userId) {
      const { count } = await supabase
        .from("NumberRecommendation")
        .select("*", { count: "exact", head: true })
        .eq("userId", userId.id)
        .gte("createdAt", monthStart);
      core1UsedThisMonth = count ?? 0;
    }
  }

  return NextResponse.json({
    core1UsedThisMonth,
    core1Limit,
    eligibleAnnouncements: annUrgent.count ?? 0, // CompanyProfile 없으면 임박 공고로 대체
    urgentAnnouncements:   annUrgent.count ?? 0,
    todayAnnouncements:    annToday.count ?? 0,
  });
}
