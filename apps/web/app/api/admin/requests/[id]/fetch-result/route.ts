/**
 * POST /api/admin/requests/[id]/fetch-result
 * 특정 BidRequest에 대해 G2B API에서 개찰결과를 직접 조회하여 업데이트
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { g2bFetchBidResultPage, g2bFetchOpengComptForBidNtceNo, g2bParseDate, toYMD } from "@/lib/g2b";

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

  // 날짜 범위: deadline 기준 -7일 ~ +60일
  // (개찰 게재가 마감 후 1~6주 지연될 수 있어 충분한 범위 필요)
  const deadline = new Date(bidReq.deadline);
  const fromDate = toYMD(new Date(deadline.getTime() - 7 * 86400000)) + "0000";
  const toDate = toYMD(new Date(deadline.getTime() + 60 * 86400000)) + "2359";

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
    bidRate: parseFloat(rateRaw).toFixed(4),
    finalPrice: String(parseInt(priceRaw, 10)),
    numBidders: parseInt((found.prtcptCnum || found.totPrtcptCo || "0").replace(/[^0-9]/g, ""), 10),
    winnerName: found.sucsfbidCorpNm?.trim() || found.bidwinnrNm?.trim() || null,
    openedAt: found.opengDt ? g2bParseDate(found.opengDt) : null,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin.from("BidResult") as any).upsert(bidResultRow, { onConflict: "annId" });

  // BidRequest 업데이트
  const now = new Date().toISOString();
  // 사정율 base = Announcement.bsisAmt 우선 (기초금액). budget(추정가격) 직접 사용은 사정율 잘못 큰 값 유발.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: annRow } = await (admin.from("Announcement") as any)
    .select("bsisAmt,aValueAmt,budget")
    .eq("konepsId", bidReq.konepsId)
    .maybeSingle();
  const bsisAmtNum = Number(annRow?.bsisAmt ?? 0);
  const avAmtNum   = Number(annRow?.aValueAmt ?? 0);
  const annBudget  = Number(annRow?.budget ?? 0);
  const reqBudget  = Number(bidReq.budget ?? 0);
  const base = bsisAmtNum > 0 ? bsisAmtNum
             : avAmtNum > 0   ? avAmtNum
             : annBudget > 0  ? Math.round(annBudget * 1.1)
             : Math.round(reqBudget * 1.1);
  const finalPrice = Number(bidResultRow.finalPrice);
  const bidRate = parseFloat(rateRaw);

  const actualSajungRate =
    base > 0 && bidRate > 0
      ? (finalPrice / (bidRate / 100) / base) * 100
      : null;

  // User 조회 (낙찰 여부 판별 + 사업자번호 — OpengCompt 매칭용)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: user } = await (admin.from("User") as any)
    .select("bizName,bizNo")
    .eq("id", bidReq.userId)
    .single();

  const bizName: string = user?.bizName ?? "";
  const userBizNo: string = String(user?.bizNo ?? "").replace(/\D/g, "");
  const winnerName: string = bidResultRow.winnerName ?? "";
  const isWon: boolean =
    bizName.length > 1 && winnerName.length > 1
      ? winnerName.includes(bizName) || bizName.includes(winnerName)
      : false;

  // OpengCompt 단건 조회 → 사용자 사업자번호 매칭으로 순위·투찰가·추첨번호·G2B 사유(rmrk) 채움
  let userRank: number | null = null;
  let userBidPriceFromG2B: number | null = null;
  let userBidRate: number | null = null;
  let userDrwtNo1: number | null = null;
  let userDrwtNo2: number | null = null;
  let userBidAtFromG2B: string | null = null;
  let userRemark: string | null = null;
  if (userBizNo.length === 10) {
    try {
      const comptItems = await g2bFetchOpengComptForBidNtceNo({
        bidNtceNo: bidReq.konepsId,
        deadline,
      });
      const userBizNoLast10 = userBizNo.slice(-10);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const normalizeBiz = (raw: any): string => {
        const s = String(raw ?? "").replace(/\D/g, "");
        return s.length >= 10 ? s.slice(-10) : s.padStart(10, "0");
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const getCandidateBiznos = (c: any): string[] => [
        c.prcbdrBizno, c.bizno, c.bizNo, c.prtcptCorpBizno,
        c.prcbdrCeoBizno, c.bidprrBizno,
      ].filter(Boolean).map(normalizeBiz);

      const me = comptItems.find(c => getCandidateBiznos(c).includes(userBizNoLast10));
      if (me) {
        userRank = parseInt(me.opengRank ?? "0", 10) || null;
        userBidPriceFromG2B = parseInt(String(me.bidprcAmt ?? "0").replace(/[^0-9]/g, ""), 10) || null;
        userBidRate = parseFloat(String(me.bidprcrt ?? "0")) || null;
        userDrwtNo1 = parseInt(String(me.drwtNo1 ?? "").trim(), 10) || null;
        userDrwtNo2 = parseInt(String(me.drwtNo2 ?? "").trim(), 10) || null;
        userBidAtFromG2B = me.bidprcDt ? g2bParseDate(me.bidprcDt) : null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rmrk = String((me as any).rmrk ?? "").trim();
        userRemark = rmrk.length > 0 ? rmrk : null;
      }
    } catch (e) {
      console.error(`[fetch-result] OpengCompt 조회 실패 ${bidReq.konepsId}:`, (e as Error).message);
    }
  }

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

  // 추천 따름 자동 판정 (±0.5% 이내)
  let userFollowedRecommendation: boolean | null = null;
  if (userBidPriceFromG2B != null && recPrice > 0) {
    const diff = Math.abs(userBidPriceFromG2B - recPrice) / recPrice;
    userFollowedRecommendation = diff <= 0.005;
  }

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
    ...(userRank != null ? { userRank } : {}),
    ...(userBidPriceFromG2B != null ? { userBidPrice: String(userBidPriceFromG2B) } : {}),
    ...(userBidRate != null ? { userBidRate: userBidRate.toFixed(4) } : {}),
    ...(userDrwtNo1 != null ? { userDrwtNo1 } : {}),
    ...(userDrwtNo2 != null ? { userDrwtNo2 } : {}),
    ...(userBidAtFromG2B != null ? { userBidAt: userBidAtFromG2B } : {}),
    ...(userFollowedRecommendation != null ? { userFollowedRecommendation } : {}),
    ...(userRemark != null ? { userRemark } : {}),
  }).eq("id", id);

  return NextResponse.json({ ok: true });
}
