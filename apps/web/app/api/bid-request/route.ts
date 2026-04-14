import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: dbUser } = await admin
    .from("User")
    .select("id")
    .eq("supabaseId", user.id)
    .single();
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const userId = dbUser.id as string;

  const body = await request.json() as {
    annId: string;
    konepsId: string;
    title: string;
    orgName: string;
    deadline: string;
    budget: number;
    lowerLimitRate: number;
    aValueYn: string;
    aValueTotal: number;
    recommendedBidPrice: number;
    predictedSajungRate: number;
    estimatedPrice: number;
    lowerLimitPrice: number;
    winProbability: number;
    competitionScore: number;
  };

  const {
    annId, konepsId, title, orgName, deadline, budget,
    lowerLimitRate, aValueYn, aValueTotal,
    recommendedBidPrice, predictedSajungRate,
    estimatedPrice, lowerLimitPrice, winProbability, competitionScore,
  } = body;

  const feeRate = recommendedBidPrice < 100_000_000 ? 0.017 : 0.015;
  const agreedFeeAmount = Math.round(recommendedBidPrice * feeRate);

  const { data: existing } = await admin
    .from("BidRequest")
    .select("id")
    .eq("userId", userId)
    .eq("annId", annId)
    .maybeSingle();

  let resultId: string;

  if (existing) {
    const { data: updated, error } = await admin
      .from("BidRequest")
      .update({
        recommendedBidPrice: String(recommendedBidPrice),
        predictedSajungRate,
        estimatedPrice: String(estimatedPrice ?? 0),
        lowerLimitPrice: String(lowerLimitPrice ?? 0),
        winProbability: Math.round((winProbability ?? 0) * 100),
        competitionScore: competitionScore ?? 0,
        agreedFeeRate: feeRate,
        agreedFeeAmount: String(agreedFeeAmount),
        agreedAt: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) {
      console.error("[BidRequest] update error:", error);
      return NextResponse.json({ error: "업데이트 실패" }, { status: 500 });
    }
    resultId = (updated as { id: string }).id;
  } else {
    const { data: inserted, error } = await admin
      .from("BidRequest")
      .insert({
        userId,
        annId,
        konepsId,
        title,
        orgName,
        deadline,
        budget: String(budget ?? 0),
        lowerLimitRate,
        aValueYn: aValueYn ?? "",
        aValueTotal: String(aValueTotal ?? 0),
        recommendedBidPrice: String(recommendedBidPrice),
        predictedSajungRate,
        estimatedPrice: String(estimatedPrice ?? 0),
        lowerLimitPrice: String(lowerLimitPrice ?? 0),
        winProbability: Math.round((winProbability ?? 0) * 100),
        competitionScore: competitionScore ?? 0,
        agreedFeeRate: feeRate,
        agreedFeeAmount: String(agreedFeeAmount),
        agreedAt: new Date().toISOString(),
        recommendedAt: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) {
      console.error("[BidRequest] insert error:", error);
      return NextResponse.json({ error: "저장 실패" }, { status: 500 });
    }
    resultId = (inserted as { id: string }).id;
  }

  return NextResponse.json({ id: resultId, feeRate, agreedFeeAmount });
}
