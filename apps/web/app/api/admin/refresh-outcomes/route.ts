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

// G2B 직접 조회 (BidResult 미수집 공고용 — 단건)
// inqryDiv=2 (개찰일자 기준) + 마감 ±15일 (30일 이내 = G2B 제한 내)
// 개찰 = 마감일과 같은 날~며칠 후, 결과 등록 지연도 감안하여 +15일까지 검색
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchFromG2B(konepsId: string, deadline: Date): Promise<any | null> {
  const fromDate = toYMD(new Date(deadline.getTime() - 3 * 86400000)) + "0000";
  const toDate = toYMD(new Date(deadline.getTime() + 15 * 86400000)) + "2359";
  for (const op of SCSBID_OPS) {
    try {
      const { items } = await g2bFetchBidResultPage({
        pageNo: 1, numOfRows: 999, inqryBgnDt: fromDate, inqryEndDt: toDate,
        operation: op, inqryDiv: "2", // 개찰일자 기준
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = items.find((i: any) => i.bidNtceNo?.trim() === konepsId);
      if (m) return m;
    } catch (e) {
      console.error(`[refresh-outcomes] G2B ${op} 호출 실패:`, (e as Error).message);
    }
  }
  return null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // 1. 마감 지났으나 결과 미입력 BidRequest 조회 (최대 50건 — G2B 호출 부담)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pending, error: pendingErr } = await (admin.from("BidRequest") as any)
    .select("id,userId,konepsId,budget,recommendedBidPrice,predictedSajungRate,deadline")
    .lt("deadline", now)
    .is("isWon", null)
    .limit(50);

  if (pendingErr) {
    return NextResponse.json({ error: pendingErr.message }, { status: 500 });
  }
  if (!pending || pending.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, message: "처리 대상 없음" });
  }

  // 2. konepsId 목록으로 BidResult 배치 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const konepsIds = [...new Set(pending.map((r: any) => r.konepsId).filter(Boolean))];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: results } = await (admin.from("BidResult") as any)
    .select("annId,bidRate,finalPrice,numBidders,winnerName,openedAt")
    .in("annId", konepsIds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resultMap: Record<string, any> = Object.fromEntries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (results ?? []).map((r: any) => [r.annId, r])
  );

  // 3. userId 목록으로 User(회사명) 배치 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userIds = [...new Set(pending.map((r: any) => r.userId).filter(Boolean))];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: users } = await (admin.from("User") as any)
    .select("id,bizName")
    .in("id", userIds);
  const userMap: Record<string, string> = Object.fromEntries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (users ?? []).map((u: any) => [u.id, u.bizName ?? ""])
  );

  // 4. 각 BidRequest 업데이트
  let updated = 0;
  let skipped = 0;
  let g2bFetched = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const req of pending as any[]) {
    let res = resultMap[req.konepsId];
    // BidResult 없으면 G2B 직접 조회 (단건, 4 op 순차)
    if (!res && req.konepsId && req.deadline) {
      const found = await fetchFromG2B(req.konepsId, new Date(req.deadline));
      if (found) {
        const rateRaw = (found.sucsfbidRate || "").replace(/[^0-9.]/g, "");
        const priceRaw = (found.sucsfbidAmt || "").replace(/[^0-9]/g, "");
        if (rateRaw && priceRaw) {
          res = {
            annId: req.konepsId,
            bidRate: parseFloat(rateRaw).toFixed(3),
            finalPrice: String(parseInt(priceRaw, 10)),
            numBidders: parseInt((found.prtcptCnum || found.totPrtcptCo || "0").replace(/[^0-9]/g, ""), 10),
            winnerName: found.sucsfbidCorpNm?.trim() || found.bidwinnrNm?.trim() || null,
            openedAt: found.opengDt ? g2bParseDate(found.opengDt) : null,
          };
          // BidResult 에 upsert (다음 호출부터는 캐시됨)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (admin.from("BidResult") as any).upsert(res, { onConflict: "annId" });
          g2bFetched++;
        }
      }
    }
    if (!res) { skipped++; continue; }

    const bizName: string = userMap[req.userId] ?? "";
    const winnerName: string = res.winnerName ?? "";

    const isWon: boolean =
      bizName.length > 1 && winnerName.length > 1
        ? winnerName.includes(bizName) || bizName.includes(winnerName)
        : false;

    const budget = Number(req.budget ?? 0);
    const finalPrice = Number(res.finalPrice ?? 0);
    const bidRate = Number(res.bidRate ?? 0);
    const actualSajungRate =
      budget > 0 && bidRate > 0
        ? (finalPrice / (bidRate / 100) / budget) * 100
        : null;

    const predictedSajung = Number(req.predictedSajungRate ?? 0);
    const deviationPct =
      actualSajungRate != null && predictedSajung > 0
        ? Math.abs(predictedSajung - actualSajungRate)
        : null;
    const isHit = deviationPct != null ? deviationPct <= 0.5 : null;

    const recPrice = Number(req.recommendedBidPrice ?? 0);
    const feeRate = recPrice > 0 && recPrice < 100_000_000 ? 0.017 : 0.015;
    const feeAmount = isWon ? Math.round(finalPrice * feeRate) : 0;
    const feeStatus = isWon ? "invoiced" : "waived";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (admin.from("BidRequest") as any)
      .update({
        isWon,
        winnerName: res.winnerName ?? null,
        actualFinalPrice: String(Math.round(finalPrice)),
        totalBidders: res.numBidders ?? null,
        openingDt: res.openedAt ?? null,
        actualSajungRate: actualSajungRate?.toFixed(4) ?? null,
        deviationPct: deviationPct?.toFixed(4) ?? null,
        isHit,
        feeRate: feeRate.toFixed(4),
        feeAmount: String(feeAmount),
        feeStatus,
        resultDetectedAt: now,
      })
      .eq("id", req.id);

    if (updateErr) {
      console.error("[refresh-outcomes] 업데이트 오류:", req.id, updateErr.message);
    } else {
      updated++;
    }
  }

  return NextResponse.json({
    ok: true,
    total: pending.length,
    updated,
    skipped,
    g2bFetched,
  });
}
