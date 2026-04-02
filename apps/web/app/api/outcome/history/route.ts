/**
 * GET /api/outcome/history
 * 현재 사용자의 BidOutcome 이력 조회 (투찰 결과 타임라인)
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: dbUser } = await supabase
    .from("User").select("id").eq("supabaseId", user.id).single();
  if (!dbUser) return NextResponse.json({ outcomes: [] });

  const { data: outcomes } = await supabase
    .from("BidOutcome")
    .select("id,annId,bidPrice,result,actualSajungRate,actualFinalPrice,numBidders,bidAt,openedAt,Announcement!annId(title,orgName)")
    .eq("userId", dbUser.id)
    .order("bidAt", { ascending: false })
    .limit(100);

  const mapped = (outcomes ?? []).map((o) => {
    const ann = (o as any).Announcement;
    return {
      id: o.id,
      annId: o.annId,
      annTitle: ann?.title ?? null,
      annOrgName: ann?.orgName ?? null,
      bidPrice: o.bidPrice ?? null,
      result: o.result,
      actualSajungRate: o.actualSajungRate ?? null,
      actualFinalPrice: o.actualFinalPrice ?? null,
      numBidders: o.numBidders ?? null,
      bidAt: o.bidAt,
      openedAt: o.openedAt ?? null,
    };
  });

  return NextResponse.json({ outcomes: mapped });
}
