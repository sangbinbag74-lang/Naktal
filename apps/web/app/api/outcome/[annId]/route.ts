/**
 * GET/POST /api/outcome/[annId]
 * CORE 1 피드백: 사용자가 실제 투찰한 금액 + 개찰 결과 저장
 * 저장 시 번호 추천 +1회 보너스 지급
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ annId: string }> };

export async function GET(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { annId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: dbUser } = await supabase
    .from("User").select("id").eq("supabaseId", user.id).single();
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // BidPricePrediction 조회 (공고 정보 + AI 예측값)
  const { data: pred } = await supabase
    .from("BidPricePrediction")
    .select("annId,predictedSajungRate,optimalBidPrice,lowerLimitPrice,Announcement!annId(title,orgName,budget,deadline)")
    .eq("annId", annId)
    .maybeSingle();

  if (!pred) return NextResponse.json({ error: "예측 데이터를 찾을 수 없습니다." }, { status: 404 });

  // 최근 번호 추천 조회 (복수예가 번호 표시용)
  const { data: rec } = await supabase
    .from("NumberRecommendation")
    .select("combo1,combo2,combo3")
    .eq("userId", dbUser.id)
    .eq("annId", annId)
    .order("createdAt", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 기존 결과 입력 여부 확인
  const { data: existing } = await supabase
    .from("BidOutcome")
    .select("id,bidPrice,result,actualSajungRate,actualFinalPrice,selectedNos")
    .eq("userId", dbUser.id)
    .eq("annId", annId)
    .order("createdAt", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ann = (pred as any).Announcement;

  return NextResponse.json({
    annId,
    annTitle: ann?.title ?? null,
    annOrgName: ann?.orgName ?? null,
    annBudget: ann?.budget ? Number(ann.budget) : null,
    annDeadline: ann?.deadline ?? null,
    optimalBidPrice: Number(pred.optimalBidPrice),
    predictedSajungRate: Number(pred.predictedSajungRate),
    lowerLimitPrice: Number(pred.lowerLimitPrice),
    combo1: rec?.combo1 ?? [],
    combo2: rec?.combo2 ?? [],
    combo3: rec?.combo3 ?? [],
    existingOutcome: existing ?? null,
  });
}

export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { annId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: dbUser } = await supabase
    .from("User").select("id").eq("supabaseId", user.id).single();
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const body = await req.json() as {
    bidPrice: number;
    selectedNos?: number[];
    result: "WIN" | "LOSE" | "DISQUALIFIED" | "PENDING";
    actualFinalPrice?: number | null;
    actualSajungRate?: number | null;
    numBidders?: number | null;
    bidAt: string;
  };

  if (!body.bidPrice || body.bidPrice <= 0) {
    return NextResponse.json({ error: "투찰금액이 유효하지 않습니다." }, { status: 400 });
  }

  // bidRate 계산: BidPricePrediction에서 budget 가져와 역산
  const { data: ann } = await supabase
    .from("Announcement").select("budget").eq("id", annId).maybeSingle();
  const budget = ann?.budget ? Number(ann.budget) : null;
  const bidRate = budget && budget > 0
    ? parseFloat(((body.bidPrice / budget) * 100).toFixed(4))
    : 0;

  // 기존 결과 확인
  const { data: existing } = await supabase
    .from("BidOutcome")
    .select("id,bonusGranted")
    .eq("userId", dbUser.id)
    .eq("annId", annId)
    .order("createdAt", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    await supabase.from("BidOutcome").update({
      bidPrice: String(body.bidPrice),
      bidRate,
      selectedNos: body.selectedNos ?? [],
      result: body.result,
      actualFinalPrice: body.actualFinalPrice ? String(body.actualFinalPrice) : null,
      actualSajungRate: body.actualSajungRate ?? null,
      numBidders: body.numBidders ?? null,
      bidAt: body.bidAt,
      openedAt: body.result !== "PENDING" ? new Date().toISOString() : null,
    }).eq("id", existing.id);

    return NextResponse.json({ ok: true, bonusGranted: existing.bonusGranted });
  }

  // 신규 저장
  await supabase.from("BidOutcome").insert({
    userId: dbUser.id,
    annId,
    bidPrice: String(body.bidPrice),
    bidRate,
    selectedNos: body.selectedNos ?? [],
    result: body.result,
    actualFinalPrice: body.actualFinalPrice ? String(body.actualFinalPrice) : null,
    actualSajungRate: body.actualSajungRate ?? null,
    numBidders: body.numBidders ?? null,
    finalWinningNos: [],
    bidAt: body.bidAt,
    openedAt: body.result !== "PENDING" ? new Date().toISOString() : null,
    bonusGranted: true,
  });

  // 보너스 지급 — NumberRecommendation에 bonus 기록
  await supabase.from("NumberRecommendation").insert({
    userId: dbUser.id,
    annId: null,
    category: "BONUS",
    budgetRange: "BONUS",
    region: "BONUS",
    combo1: [], combo2: [], combo3: [],
    hitRate1: 0, hitRate2: 0, hitRate3: 0,
    sampleSize: 0,
    modelVersion: "bonus-outcome-v1",
  });

  return NextResponse.json({ ok: true, bonusGranted: true });
}
