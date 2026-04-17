/**
 * POST /api/admin/requests/[id]/fetch-result
 * 특정 BidRequest에 대해 G2B API에서 개찰결과를 직접 조회하여 업데이트
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { g2bFetchBidResultPage, g2bParseDate, toYMD } from "@/lib/g2b";

const SCSBID_OPS = [
  "getScsbidListSttusThng",
  "getScsbidListSttusCnstwk",
  "getScsbidListSttusServc",
  "getScsbidListSttusFrgcpt",
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const admin = createAdminClient();

  // BidRequest 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: bidReq, error: reqErr } = await (admin.from("BidRequest") as any)
    .select("id,userId,konepsId,budget,recommendedBidPrice,predictedSajungRate,deadline")
    .eq("id", id)
    .single();

  if (reqErr || !bidReq) {
    return NextResponse.json({ error: "BidRequest 없음" }, { status: 404 });
  }
  if (!bidReq.konepsId) {
    return NextResponse.json({ ok: false, message: "konepsId 없음" }, { status: 400 });
  }

  // 날짜 범위: deadline 기준 ±14일
  const deadline = new Date(bidReq.deadline);
  const fromDate = toYMD(new Date(deadline.getTime() - 14 * 86400000)) + "0000";
  const toDate = toYMD(new Date(deadline.getTime() + 14 * 86400000)) + "2359";

  // 4개 카테고리 순서대로 조회 (매칭되면 중단)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let found: any = null;
  for (const op of SCSBID_OPS) {
    try {
      const { items } = await g2bFetchBidResultPage({
        pageNo: 1,
        numOfRows: 100,
        inqryBgnDt: fromDate,
        inqryEndDt: toDate,
        operation: op,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const match = items.find((i: any) => i.bidNtceNo?.trim() === bidReq.konepsId);
      if (match) { found = match; break; }
    } catch {
      // 해당 카테고리 실패 시 다음으로
    }
  }

  if (!found) {
    return NextResponse.json({ ok: false, message: "G2B에 개찰결과 미게재" });
  }

  // BidResult upsert
  const rateRaw  = (found.sucsfbidRate || "").replace(/[^0-9.]/g, "");
  const priceRaw = (found.sucsfbidAmt  || "").replace(/[^0-9]/g, "");
  if (!rateRaw || !priceRaw) {
    return NextResponse.json({ ok: false, message: "G2B 결과에 낙찰금액/낙찰률 없음" });
  }

  const bidResultRow = {
    annId: bidReq.konepsId,
    bidRate: parseFloat(rateRaw).toFixed(3),
    finalPrice: String(parseInt(priceRaw, 10)),
    numBidders: parseInt((found.prtcptCnum || found.totPrtcptCo || "0").replace(/[^0-9]/g, ""), 10),
    winnerName: found.sucsfbidCorpNm?.trim() || found.bidwinnrNm?.trim() || null,
    openedAt: found.opengDt ? g2bParseDate(found.opengDt) : null,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin.from("BidResult") as any).upsert(bidResultRow, { onConflict: "annId" });

  // BidRequest 업데이트
  const now = new Date().toISOString();
  const budget = Number(bidReq.budget ?? 0);
  const finalPrice = Number(bidResultRow.finalPrice);
  const bidRate = parseFloat(rateRaw);

  const actualSajungRate =
    budget > 0 && bidRate > 0
      ? (finalPrice / (bidRate / 100) / budget) * 100
      : null;

  // User 조회 (낙찰 여부 판별)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: user } = await (admin.from("User") as any)
    .select("bizName")
    .eq("id", bidReq.userId)
    .single();

  const bizName: string = user?.bizName ?? "";
  const winnerName: string = bidResultRow.winnerName ?? "";
  const isWon: boolean =
    bizName.length > 1 && winnerName.length > 1
      ? winnerName.includes(bizName) || bizName.includes(winnerName)
      : false;

  const predictedSajung = Number(bidReq.predictedSajungRate ?? 0);
  const deviationPct =
    actualSajungRate != null && predictedSajung > 0
      ? Math.abs(predictedSajung - actualSajungRate)
      : null;
  const isHit = deviationPct != null ? deviationPct <= 0.5 : null;

  const recPrice = Number(bidReq.recommendedBidPrice ?? 0);
  const feeRate = recPrice > 0 && recPrice < 100_000_000 ? 0.017 : 0.015;
  const feeAmount = isWon ? Math.round(finalPrice * feeRate) : 0;
  const feeStatus = isWon ? "invoiced" : "waived";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin.from("BidRequest") as any).update({
    isWon,
    winnerName: bidResultRow.winnerName ?? null,
    actualFinalPrice: String(Math.round(finalPrice)),
    totalBidders: bidResultRow.numBidders ?? null,
    openingDt: bidResultRow.openedAt ?? null,
    actualSajungRate: actualSajungRate?.toFixed(4) ?? null,
    deviationPct: deviationPct?.toFixed(4) ?? null,
    isHit,
    feeRate: feeRate.toFixed(4),
    feeAmount: String(feeAmount),
    feeStatus,
    resultDetectedAt: now,
  }).eq("id", id);

  return NextResponse.json({ ok: true });
}
