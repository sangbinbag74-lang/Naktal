import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// 의뢰 여부 확인 (BidRequestButton 마운트 시)
export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ exists: false }, { status: 200 });

  const annId = request.nextUrl.searchParams.get("annId");
  if (!annId) return NextResponse.json({ exists: false });

  const admin = createAdminClient();
  const { data: dbUser } = await admin.from("User").select("id").eq("supabaseId", user.id).single();
  if (!dbUser) return NextResponse.json({ exists: false });

  const { data } = await admin
    .from("BidRequest")
    .select("id,recommendedBidPrice,createdAt")
    .eq("userId", (dbUser as { id: string }).id)
    .eq("annId", annId)
    .is("cancelledAt", null)
    .maybeSingle();

  return NextResponse.json({
    exists: !!data,
    data: data ?? null,
  });
}

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
    // 클라이언트(comprehensive) 가 이미 동적 마진 + seq 적용한 추천가 그대로 사용
    // → comprehensive 와 BidRequest 저장값 일치 보장 (Footnote 와 실제 일치)
    const personalBidPrice = Math.round(recommendedBidPrice);
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
