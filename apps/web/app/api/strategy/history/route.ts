import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: dbUser } = await supabase
    .from("User")
    .select("id")
    .eq("supabaseId", user.id)
    .single();
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { data: outcomes } = await supabase
    .from("BidOutcome")
    .select("id,annId,recommendationId,selectedNos,bidRate,result,recommendHit,bidAt")
    .eq("userId", dbUser.id)
    .order("bidAt", { ascending: false })
    .limit(100);

  // 추천 번호 조회
  const recIds = (outcomes ?? []).map((o) => o.recommendationId).filter(Boolean) as string[];
  let recMap: Record<string, { combo1: number[]; combo2: number[]; combo3: number[] }> = {};
  if (recIds.length > 0) {
    const { data: recs } = await supabase
      .from("NumberRecommendation")
      .select("id,combo1,combo2,combo3")
      .in("id", recIds);
    for (const r of recs ?? []) recMap[r.id] = r;
  }

  // 공고 정보 조회
  const annIds = [...new Set((outcomes ?? []).map((o) => o.annId).filter(Boolean) as string[])];
  type AnnRow = { id: string; title: string; orgName: string; budget: string };
  let annMap: Record<string, AnnRow> = {};
  if (annIds.length > 0) {
    const { data: anns } = await supabase
      .from("Announcement")
      .select("id,title,orgName,budget")
      .in("id", annIds);
    for (const a of (anns ?? []) as AnnRow[]) annMap[a.id] = a;
  }

  function fmtBudget(b: string) {
    const n = parseInt(b, 10);
    if (isNaN(n)) return b;
    if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억원`;
    if (n >= 10000) return `${(n / 10000).toFixed(0)}만원`;
    return new Intl.NumberFormat("ko-KR").format(n) + "원";
  }

  const enriched = (outcomes ?? []).map((o) => {
    const ann = o.annId ? annMap[o.annId] : null;
    return {
      ...o,
      recommendation: o.recommendationId ? recMap[o.recommendationId] : null,
      annTitle: ann?.title ?? null,
      annOrgName: ann?.orgName ?? null,
      annBudget: ann ? fmtBudget(ann.budget) : null,
    };
  });

  // 통계
  const all = (outcomes ?? []).filter((o) => o.result !== "PENDING");
  const wins = all.filter((o) => o.result === "WIN").length;
  const hitOnes = all.filter((o) => o.recommendHit === true).length;

  const stats = {
    total: all.length,
    wins,
    winRate: all.length > 0 ? (wins / all.length) * 100 : 0,
    hitRate: all.length > 0 ? (hitOnes / all.length) * 100 : 0,
  };

  return NextResponse.json({ outcomes: enriched, stats });
}
