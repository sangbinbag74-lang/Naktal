import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ recommendId: string }> },
): Promise<NextResponse> {
  const { recommendId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("NumberRecommendation")
    .select("id,annId,category,budgetRange,region,combo1,combo2,combo3,hitRate1,hitRate2,hitRate3,sampleSize,createdAt")
    .eq("id", recommendId)
    .maybeSingle();

  if (!data) return NextResponse.json({ error: "추천 이력을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(data);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ recommendId: string }> },
): Promise<NextResponse> {
  const { recommendId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: dbUser } = await supabase
    .from("User")
    .select("id")
    .eq("supabaseId", user.id)
    .single();
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { data: rec } = await supabase
    .from("NumberRecommendation")
    .select("id,userId,annId,combo1,combo2,combo3")
    .eq("id", recommendId)
    .eq("userId", dbUser.id)
    .maybeSingle();
  if (!rec) return NextResponse.json({ error: "추천 이력 없음" }, { status: 404 });

  // 이미 결과 입력됐는지 확인
  const { data: existing } = await supabase
    .from("BidOutcome")
    .select("id,bonusGranted")
    .eq("recommendationId", recommendId)
    .maybeSingle();

  const body = await req.json() as {
    selectedNos: number[];
    bidRate: number;
    result: "WIN" | "LOSE" | "DISQUALIFIED";
    finalWinningNos?: number[];
    actualBidRate?: number;
    numBidders?: number;
    bidAt: string;
  };

  // 추천 번호 적중 여부 판정
  const allRecommended = [...(rec.combo1 ?? []), ...(rec.combo2 ?? []), ...(rec.combo3 ?? [])];
  const recommendHit = body.selectedNos.some((n) => allRecommended.includes(n));

  if (existing) {
    // 업데이트
    await supabase.from("BidOutcome").update({
      selectedNos: body.selectedNos,
      bidRate: body.bidRate,
      result: body.result,
      finalWinningNos: body.finalWinningNos ?? [],
      actualBidRate: body.actualBidRate ?? null,
      numBidders: body.numBidders ?? null,
      recommendHit,
      bidAt: body.bidAt,
    }).eq("id", existing.id);
    return NextResponse.json({ ok: true, bonusGranted: existing.bonusGranted });
  }

  // 새 결과 저장
  await supabase.from("BidOutcome").insert({
    userId: dbUser.id,
    annId: rec.annId ?? "unknown",
    recommendationId: recommendId,
    selectedNos: body.selectedNos,
    bidRate: body.bidRate,
    result: body.result,
    finalWinningNos: body.finalWinningNos ?? [],
    actualBidRate: body.actualBidRate ?? null,
    numBidders: body.numBidders ?? null,
    recommendHit,
    bidAt: body.bidAt,
    bonusGranted: true,
  });

  // 추천 횟수 보너스 지급 — 이번 달 사용량에서 1회 차감 취소 (NumberRecommendation 추가 삽입으로 구현)
  // 실제 구현: 별도 bonus 컬럼 or 이번달 카운트 -1
  // 여기서는 bonus 기록을 NumberRecommendation에 modelVersion="bonus" 로 표시
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
