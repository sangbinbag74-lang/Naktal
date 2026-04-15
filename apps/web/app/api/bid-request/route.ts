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
    bizRegNo?: string;
    repName?: string;
  };

  const {
    annId, konepsId, title, orgName, deadline, budget,
    lowerLimitRate, aValueYn, aValueTotal,
    recommendedBidPrice, predictedSajungRate,
    estimatedPrice, lowerLimitPrice, winProbability, competitionScore,
    bizRegNo, repName,
  } = body;

  const contractIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // UPDATE 분기용 기본 수수료 (INSERT는 personalFeeRate/Amount로 override)
  let feeRate = recommendedBidPrice < 100_000_000 ? 0.017 : 0.015;
  let agreedFeeAmount = Math.round(recommendedBidPrice * feeRate);

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
        recommendedBidPrice: String(Math.round(recommendedBidPrice)),
        predictedSajungRate,
        estimatedPrice: String(Math.round(estimatedPrice ?? 0)),
        lowerLimitPrice: String(Math.round(lowerLimitPrice ?? 0)),
        winProbability: Math.round((winProbability ?? 0) * 100),
        competitionScore: competitionScore ?? 0,
        agreedFeeRate: feeRate,
        agreedFeeAmount: String(agreedFeeAmount),
        agreedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...(bizRegNo ? { bizRegNo } : {}),
        ...(repName ? { repName } : {}),
        ...(bizRegNo ? { contractAt: new Date().toISOString(), contractIp } : {}),
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
    // 순번 기반 개인화: 같은 공고를 분석한 회사 수 조회
    const { count: priorCount } = await admin
      .from("BidRequest")
      .select("id", { count: "exact", head: true })
      .eq("annId", annId)
      .is("cancelledAt", null);

    const seq = (priorCount ?? 0) + 1;
    const personalBidPrice = Math.max(
      Math.round(estimatedPrice) - seq * 100,
      Math.round(lowerLimitPrice) + 1
    );
    feeRate = personalBidPrice < 100_000_000 ? 0.017 : 0.015;
    agreedFeeAmount = Math.round(personalBidPrice * feeRate);

    const { data: inserted, error } = await admin
      .from("BidRequest")
      .insert({
        id: crypto.randomUUID(),
        userId,
        annId,
        konepsId,
        title,
        orgName,
        deadline,
        budget: String(Math.round(budget ?? 0)),
        lowerLimitRate,
        aValueYn: aValueYn ?? "",
        aValueTotal: String(Math.round(aValueTotal ?? 0)),
        recommendedBidPrice: String(personalBidPrice),
        predictedSajungRate,
        estimatedPrice: String(Math.round(estimatedPrice ?? 0)),
        lowerLimitPrice: String(Math.round(lowerLimitPrice ?? 0)),
        winProbability: Math.round((winProbability ?? 0) * 100),
        competitionScore: competitionScore ?? 0,
        agreedFeeRate: feeRate,
        agreedFeeAmount: String(agreedFeeAmount),
        agreedAt: new Date().toISOString(),
        recommendedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...(bizRegNo ? { bizRegNo } : {}),
        ...(repName ? { repName } : {}),
        ...(bizRegNo ? { contractAt: new Date().toISOString(), contractIp } : {}),
      })
      .select("id")
      .single();
    if (error) {
      console.error("[BidRequest] insert error:", error);
      return NextResponse.json({ error: `저장 실패: ${error.message} (code: ${error.code})` }, { status: 500 });
    }
    resultId = (inserted as { id: string }).id;
  }

  return NextResponse.json({ id: resultId, feeRate, agreedFeeAmount });
}
