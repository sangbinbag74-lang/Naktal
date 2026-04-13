/**
 * CORE 2 — 실시간 참여자 수 조회 API
 * GET /api/realtime/participants?annId=...
 * Pro 전용. 최근 ParticipantSnapshot 이력 반환.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const annId = req.nextUrl.searchParams.get("annId");
  if (!annId) return NextResponse.json({ error: "annId 필요" }, { status: 400 });

  // Announcement.id (cuid) 조회
  const { data: ann } = await supabase
    .from("Announcement")
    .select("id,title,deadline,budget")
    .eq("konepsId", annId)
    .maybeSingle();
  if (!ann) return NextResponse.json({ error: "공고 없음" }, { status: 404 });

  // 최근 24시간 스냅샷
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: snapshots } = await supabase
    .from("ParticipantSnapshot")
    .select("count,snapshotAt")
    .eq("annId", ann.id)
    .gte("snapshotAt", since)
    .order("snapshotAt", { ascending: true });

  const latest = snapshots?.[snapshots.length - 1];

  return NextResponse.json({
    annId,
    title: ann.title,
    deadline: ann.deadline,
    budget: ann.budget,
    currentCount: latest?.count ?? null,
    snapshots: snapshots ?? [],
    snapshotChannel: `participants:${ann.id}`, // Supabase Realtime channel
  });
}
