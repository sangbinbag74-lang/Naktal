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
    numberStrategy?: unknown;
  };

  const {
    annId, konepsId, title, orgName, deadline, budget,
    lowerLimitRate, aValueYn, aValueTotal,
    recommendedBidPrice, predictedSajungRate,
    estimatedPrice, lowerLimitPrice, winProbability, competitionScore,
    bizRegNo, repName, numberStrategy,
  } = body;

  // 데이터 부족(fallback) 의뢰 차단 — BidPricePrediction 검증
  // sampleSize=0 인 경우 comprehensive route 가 적재 차단했으므로 row 없음 → 거부
  const { data: pred } = await admin
    .from("BidPricePrediction")
    .select("sampleSize")
    .eq("annId", annId)
    .gt("expiresAt", new Date().toISOString())
    .maybeSingle();
  const sampleSize = Number((pred as { sampleSize?: number } | null)?.sampleSize ?? 0);
  if (!pred || sampleSize < 5) {
    return NextResponse.json({
      error: "INSUFFICIENT_DATA",
      message: "발주처·업종 학습 데이터가 부족하여 의뢰를 받을 수 없습니다. 충분한 입찰 이력이 쌓인 후 재시도 부탁드립니다.",
      sampleSize,
    }, { status: 400 });
  }

  // 전자서명 검증 — 본인 사업자번호/대표자명 일치 강제 (계약 위조 방지)
  if (bizRegNo || repName) {
    const { data: userInfo } = await admin
      .from("User")
      .select("bizNo, bizName, ownerName")
      .eq("id", userId)
      .single();
    if (!userInfo) {
      return NextResponse.json({ error: "USER_NOT_FOUND", message: "사용자 정보 없음" }, { status: 401 });
    }
    const userBizNo = String((userInfo as { bizNo?: string }).bizNo ?? "").replace(/\D/g, "");
    const userOwner = String((userInfo as { ownerName?: string }).ownerName ?? "").trim();
    const userBizName = String((userInfo as { bizName?: string }).bizName ?? "").trim();
    const inputBizNo = String(bizRegNo ?? "").replace(/\D/g, "");
    const inputName = String(repName ?? "").trim();

    // 1. 사업자번호 10자리 + 본인 일치
    if (inputBizNo.length !== 10) {
      return NextResponse.json({
        error: "INVALID_BIZNO",
        message: "사업자등록번호는 10자리 숫자입니다.",
      }, { status: 400 });
    }
    if (inputBizNo !== userBizNo) {
      return NextResponse.json({
        error: "BIZNO_MISMATCH",
        message: "본인 사업자등록번호가 아닙니다. 가입 시 등록한 사업자번호로만 계약 가능합니다.",
      }, { status: 400 });
    }
    // 2. 대표자명 또는 회사명 일치 (둘 중 하나라도 매칭)
    const ownerOk = userOwner.length > 0 && (
      userOwner === inputName || inputName.includes(userOwner) || userOwner.includes(inputName)
    );
    const bizNameOk = userBizName.length > 0 && (
      userBizName === inputName || inputName.includes(userBizName) || userBizName.includes(inputName)
    );
    if (!ownerOk && !bizNameOk) {
      return NextResponse.json({
        error: "NAME_MISMATCH",
        message: "대표자명이 가입 정보와 일치하지 않습니다.",
      }, { status: 400 });
    }
  }

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
        ...(numberStrategy ? { numberStrategy } : {}),
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
        ...(numberStrategy ? { numberStrategy } : {}),
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
