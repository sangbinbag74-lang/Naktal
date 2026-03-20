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

  const enriched = (outcomes ?? []).map((o) => ({
    ...o,
    recommendation: o.recommendationId ? recMap[o.recommendationId] : null,
  }));

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
