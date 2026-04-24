import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const PLAN_LIMITS: Record<string, number> = {
  FREE: 3,
  STANDARD: 30,
  PRO: -1,
};

// 쿼리 실패 시 폴백 기본값 — 사용자에게 빈 페이지 대신 대략치 표시
const FALLBACK = {
  todayAnnouncements: 0,
  urgentAnnouncements: 0,
  core1Used: 0,
};

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const d3later   = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();

  // User 조회 실패 → FREE 플랜 기본 적용
  let dbUserId: string | null = null;
  let plan = "FREE";
  try {
    const { data: dbUser } = await admin.from("User").select("id, plan").eq("supabaseId", user.id).single();
    if (dbUser) {
      dbUserId = dbUser.id as string;
      plan = (dbUser.plan as string) ?? "FREE";
    }
  } catch {
    // 사용자 프로필 일시 조회 실패 — FREE 기본
  }
  const core1Limit = PLAN_LIMITS[plan] ?? 3;

  // 3개 카운트 독립 실행 — 하나 실패해도 나머지 반영
  const [core1Result, annToday, annUrgent] = await Promise.allSettled([
    dbUserId
      ? admin.from("NumberRecommendation")
          .select("*", { count: "exact", head: true })
          .eq("userId", dbUserId)
          .gte("createdAt", monthStart)
      : Promise.resolve({ count: 0 }),
    admin.from("Announcement")
      .select("*", { count: "exact", head: true })
      .gte("createdAt", todayStart),
    admin.from("Announcement")
      .select("*", { count: "exact", head: true })
      .gte("deadline", now.toISOString())
      .lte("deadline", d3later),
  ]);

  const count = (r: PromiseSettledResult<{ count: number | null }>, fb: number): number => {
    if (r.status !== "fulfilled") return fb;
    return r.value.count ?? fb;
  };

  return NextResponse.json({
    core1UsedThisMonth: count(core1Result, FALLBACK.core1Used),
    core1Limit,
    eligibleAnnouncements: count(annUrgent, FALLBACK.urgentAnnouncements),
    urgentAnnouncements:   count(annUrgent, FALLBACK.urgentAnnouncements),
    todayAnnouncements:    count(annToday, FALLBACK.todayAnnouncements),
  });
}
