/**
 * CORE 2 — 실시간 참여자 수 조회 API
 * GET /api/realtime/participants?annId=...
 * Pro 전용(서버 집행). 최근 ParticipantSnapshot 이력 반환.
 * 스냅샷이 없고 마감이 지난 공고면 KONEPS 개찰 결과를 즉석 1회 조회해 저장 (온디맨드).
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { canAccess, Feature } from "@/lib/plan-guard";
import { g2bFetchOpengComptForBidNtceNo } from "@/lib/g2b";
import type { Plan } from "@naktal/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // PRO 이상 전용 (grandfathered = 영구 PRO) — UI 블러만으로는 직접 호출 못 막음
  const admin = createAdminClient();
  const { data: dbUser } = await admin
    .from("User")
    .select("plan,grandfathered,isAdmin")
    .eq("supabaseId", user.id)
    .single();
  const effPlan = (dbUser?.grandfathered ? "PRO" : dbUser?.plan ?? "FREE") as Plan;
  if (!dbUser?.isAdmin && !canAccess(effPlan, Feature.REALTIME_MONITOR)) {
    return NextResponse.json(
      { error: "실시간 모니터는 PRO 플랜부터 이용할 수 있습니다.", code: "PLAN_REQUIRED", upgradeUrl: "/billing" },
      { status: 403 },
    );
  }

  const annId = req.nextUrl.searchParams.get("annId");
  if (!annId) return NextResponse.json({ error: "annId 필요" }, { status: 400 });

  // Announcement.id (cuid) 조회 — 활성 우선 + 마감 폴백
  let { data: ann } = await supabase
    .from("Announcement")
    .select("id,title,deadline,budget")
    .gt("deadline", new Date().toISOString())
    .eq("konepsId", annId)
    .maybeSingle();
  if (!ann) {
    const { data: archived } = await supabase
      .from("Announcement")
      .select("id,title,deadline,budget")
      .eq("konepsId", annId)
      .maybeSingle();
    ann = archived;
  }
  if (!ann) return NextResponse.json({ error: "공고 없음" }, { status: 404 });

  // 최근 24시간 스냅샷
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let { data: snapshots } = await supabase
    .from("ParticipantSnapshot")
    .select("count,snapshotAt")
    .eq("annId", ann.id)
    .gte("snapshotAt", since)
    .order("snapshotAt", { ascending: true });

  // 24시간 내 이력이 없으면 전체 이력 폴백 (개찰 후 count 는 고정 — 과거 스냅샷도 유효)
  if (!snapshots || snapshots.length === 0) {
    const { data: allTime } = await supabase
      .from("ParticipantSnapshot")
      .select("count,snapshotAt")
      .eq("annId", ann.id)
      .order("snapshotAt", { ascending: true })
      .limit(50);
    snapshots = allTime;
  }

  // 온디맨드 프로브: 스냅샷 0건 + 마감 경과 → KONEPS 개찰 참여업체 즉석 조회 (1회, 결과는 저장)
  const deadlinePassed = new Date(String(ann.deadline)) < new Date();
  if ((!snapshots || snapshots.length === 0) && deadlinePassed) {
    const compt = await g2bFetchOpengComptForBidNtceNo({
      bidNtceNo: annId,
      deadline: new Date(String(ann.deadline)),
    }).catch(() => []);
    if (compt.length > 0) {
      const { error } = await admin.from("ParticipantSnapshot").insert({ annId: ann.id, count: compt.length });
      if (error) console.error("[realtime/participants] 온디맨드 스냅샷 저장 오류:", error.message);
      snapshots = [{ count: compt.length, snapshotAt: new Date().toISOString() }];
    }
  }

  const latest = snapshots?.[snapshots.length - 1];

  return NextResponse.json({
    annId: ann.id, // Realtime 필터가 Announcement.id(cuid) 기준 — konepsId 아님
    konepsId: annId,
    title: ann.title,
    deadline: ann.deadline,
    budget: ann.budget,
    opened: deadlinePassed,
    currentCount: latest?.count ?? null,
    snapshots: snapshots ?? [],
    snapshotChannel: `participants:${ann.id}`, // Supabase Realtime channel
  });
}
