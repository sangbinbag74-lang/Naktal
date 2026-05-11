import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { applySajungNoise, calcBidPrice } from "@/lib/core1/noise";

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
    snapshotAvgSajungRate?: number | null;
    snapshotSampleSize?: number | null;
    snapshotConfidence?: string | null;
  };

  const {
    annId, konepsId, title, orgName, deadline, budget,
    lowerLimitRate, aValueYn, aValueTotal,
    recommendedBidPrice, predictedSajungRate,
    estimatedPrice, lowerLimitPrice, winProbability, competitionScore,
    bizRegNo, repName, numberStrategy,
    snapshotAvgSajungRate, snapshotSampleSize, snapshotConfidence,
  } = body;

  // 데이터 부족(fallback) 의뢰 차단 + ML 원본 사정율 조회 (서버 재계산 기준)
  const { data: pred } = await admin
    .from("BidPricePrediction")
    .select("sampleSize,predictedSajungRate")
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
  // 서버에서 노이즈 + 추천금액 재계산 (클라이언트 입력 무시)
  // → 화면 사정율 = 추천금액 역산 = G2B 검증값 (3개 한 몸)
  const mlRate = Number((pred as { predictedSajungRate?: number }).predictedSajungRate);
  const effRate = applySajungNoise(mlRate, userId, annId, 0.05);
  const { estimatedPrice: srvEstPrice, lowerLimit: srvLowerLimit } = calcBidPrice(
    Number(budget ?? 0),
    effRate,
    Number(lowerLimitRate ?? 0),
    Number(aValueTotal ?? 0),
  );
  // 계약 시점 고정: 노이즈 적용 사정율 + 그 사정율로 재계산한 모든 금액
  const finalPredictedSajungRate = effRate;
  const finalRecommendedBidPrice = srvLowerLimit;
  const finalEstimatedPrice = srvEstPrice;
  const finalLowerLimitPrice = srvLowerLimit; // 안전 마진 제거됨 → 추천금액과 동일

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

  // 카테고리 일반 평균 사정율 — 계약 시점 1회 계산해 스냅샷 (이후 변동 차단)
  let snapshotCategoryAvg: number | null = null;
  let snapshotCategoryTotal: number | null = null;
  try {
    const { data: annRow } = await admin.from("Announcement").select("category").eq("id", annId).maybeSingle();
    const cat = (annRow as { category?: string } | null)?.category ?? "";
    if (cat) {
      const { data: catRows } = await admin
        .from("SajungRateStat")
        .select("avg,sampleSize")
        .eq("category", cat)
        .gt("sampleSize", 0)
        .order("sampleSize", { ascending: false })
        .limit(5000);
      const rows = (catRows ?? []) as Array<{ avg: number; sampleSize: number }>;
      const total = rows.reduce((s, r) => s + Number(r.sampleSize ?? 0), 0);
      if (total > 0) {
        snapshotCategoryAvg = rows.reduce((s, r) => s + Number(r.avg) * Number(r.sampleSize ?? 0), 0) / total;
        snapshotCategoryTotal = total;
      }
    }
  } catch (e) {
    console.error("[bid-request] 카테고리 평균 스냅샷 실패:", (e as Error).message);
  }

  // 수수료 = 서버 재계산 추천금액 기준 (클라이언트 입력 무시)
  let feeRate = finalRecommendedBidPrice < 100_000_000 ? 0.017 : 0.015;
  let agreedFeeAmount = Math.round(finalRecommendedBidPrice * feeRate);

  const { data: existing } = await admin
    .from("BidRequest")
    .select("id,contractAt")
    .eq("userId", userId)
    .eq("annId", annId)
    .maybeSingle();

  let resultId: string;

  if (existing) {
    // 이미 계약 완료된 row 는 모든 금액·사정율 변경 금지 (snapshot 보존)
    const alreadyContracted = (existing as { contractAt?: string | null }).contractAt != null;
    const updatePayload: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      ...(numberStrategy ? { numberStrategy } : {}),
      ...(snapshotAvgSajungRate != null ? { snapshotAvgSajungRate } : {}),
      ...(snapshotSampleSize != null ? { snapshotSampleSize } : {}),
      ...(snapshotConfidence ? { snapshotConfidence } : {}),
      ...(snapshotCategoryAvg != null ? { snapshotCategoryAvg } : {}),
      ...(snapshotCategoryTotal != null ? { snapshotCategoryTotal } : {}),
    };
    if (!alreadyContracted) {
      // 계약 전: 금액·사정율 갱신 허용
      Object.assign(updatePayload, {
        recommendedBidPrice: String(finalRecommendedBidPrice),
        predictedSajungRate: finalPredictedSajungRate,
        estimatedPrice: String(finalEstimatedPrice),
        lowerLimitPrice: String(finalLowerLimitPrice),
        winProbability: Math.round((winProbability ?? 0) * 100),
        competitionScore: competitionScore ?? 0,
        agreedFeeRate: feeRate,
        agreedFeeAmount: String(agreedFeeAmount),
        agreedAt: new Date().toISOString(),
        ...(bizRegNo ? { bizRegNo } : {}),
        ...(repName ? { repName } : {}),
        ...(bizRegNo ? { contractAt: new Date().toISOString(), contractIp } : {}),
      });
    }
    const { data: updated, error } = await admin
      .from("BidRequest")
      .update(updatePayload)
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) {
      console.error("[BidRequest] update error:", error);
      return NextResponse.json({ error: "업데이트 실패" }, { status: 500 });
    }
    resultId = (updated as { id: string }).id;
  } else {
    feeRate = finalRecommendedBidPrice < 100_000_000 ? 0.017 : 0.015;
    agreedFeeAmount = Math.round(finalRecommendedBidPrice * feeRate);

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
        recommendedBidPrice: String(finalRecommendedBidPrice),
        predictedSajungRate: finalPredictedSajungRate,
        estimatedPrice: String(finalEstimatedPrice),
        lowerLimitPrice: String(finalLowerLimitPrice),
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
        ...(snapshotAvgSajungRate != null ? { snapshotAvgSajungRate } : {}),
        ...(snapshotSampleSize != null ? { snapshotSampleSize } : {}),
        ...(snapshotConfidence ? { snapshotConfidence } : {}),
        ...(snapshotCategoryAvg != null ? { snapshotCategoryAvg } : {}),
        ...(snapshotCategoryTotal != null ? { snapshotCategoryTotal } : {}),
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
