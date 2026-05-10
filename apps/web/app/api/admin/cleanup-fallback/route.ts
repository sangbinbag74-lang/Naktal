import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * 잘못된 fallback 캐시·이력 강제 정리.
 *
 * 1. BidPricePrediction
 *    - sampleSize=0 (fallback 적재된 row) 모두 삭제
 *    - predictedSajungRate=103.8 (구 하드코딩 fallback) 모두 삭제
 *
 * 2. BidRequest (미계약·미마감만)
 *    - predictedSajungRate=103.8 인 row 의 분석 필드를 NULL 로 초기화
 *    - 사용자 재진입 시 AutoAnalysisTrigger 가 재분석하여 정상값 갱신
 *    - contractAt 또는 cancelledAt 있는 row 는 계약 이력 보존을 위해 미터치
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // 1-a) BidPricePrediction sampleSize=0 삭제
  const { count: bppZeroDel, error: bppZeroErr } = await admin
    .from("BidPricePrediction")
    .delete({ count: "exact" })
    .eq("sampleSize", 0);
  if (bppZeroErr) console.error("[cleanup] BPP sampleSize=0 삭제 실패:", bppZeroErr);

  // 1-b) BidPricePrediction predictedSajungRate=103.8 삭제 (구 하드코딩)
  const { count: bppRateDel, error: bppRateErr } = await admin
    .from("BidPricePrediction")
    .delete({ count: "exact" })
    .eq("predictedSajungRate", 103.8);
  if (bppRateErr) console.error("[cleanup] BPP rate=103.8 삭제 실패:", bppRateErr);

  // 2) BidRequest 미계약·미마감 fallback row → 분석 필드 NULL
  // (재진입 시 AutoAnalysisTrigger 가 정상값으로 재분석)
  // 분석 필드 5개 NULL 처리 — 사용자 동의(bizRegNo·repName) 등 본인 정보는 유지
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: brCleaned, error: brErr } = await (admin.from("BidRequest") as any)
    .update({
      predictedSajungRate: null,
      recommendedBidPrice: null,
      lowerLimitPrice: null,
      estimatedPrice: null,
      winProbability: null,
      competitionScore: null,
    }, { count: "exact" })
    .eq("predictedSajungRate", 103.8)
    .is("contractAt", null)
    .is("cancelledAt", null)
    .gt("deadline", now);
  if (brErr) console.error("[cleanup] BidRequest 정리 실패:", brErr);

  return NextResponse.json({
    ok: true,
    bppDeleted: (bppZeroDel ?? 0) + (bppRateDel ?? 0),
    bppZeroDeleted: bppZeroDel ?? 0,
    bppRate103Deleted: bppRateDel ?? 0,
    brCleaned: brCleaned ?? 0,
    note: "BidRequest 미계약·미마감 row 만 분석 필드 NULL 처리 (계약 완료 이력은 보존)",
  });
}
