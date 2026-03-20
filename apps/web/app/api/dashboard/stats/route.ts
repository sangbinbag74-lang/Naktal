import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const PLAN_LIMITS: Record<string, number> = {
  FREE: 3,
  STANDARD: 30,
  PRO: -1,
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

  // User 레코드 조회
  const { data: dbUser } = await admin.from("User").select("id, plan").eq("supabaseId", user.id).single();

  const plan = dbUser?.plan ?? "FREE";
  const core1Limit = PLAN_LIMITS[plan] ?? 3;

  // 병렬 쿼리
  const [core1Result, annToday, annUrgent] = await Promise.all([
    dbUser?.id
      ? admin.from("NumberRecommendation")
          .select("*", { count: "exact", head: true })
          .eq("userId", dbUser.id)
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

  return NextResponse.json({
    core1UsedThisMonth: (core1Result as { count: number | null }).count ?? 0,
    core1Limit,
    eligibleAnnouncements: (annUrgent as { count: number | null }).count ?? 0,
    urgentAnnouncements:   (annUrgent as { count: number | null }).count ?? 0,
    todayAnnouncements:    (annToday as { count: number | null }).count ?? 0,
  });
}
