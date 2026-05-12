/**
 * Vercel Cron — BidResult → BidRequest 자동 채우기
 *
 * 매일 12:00 UTC (21:00 KST) — sync-g2b 이후 실행
 * 마감 지난 BidRequest 중 결과 미입력 건에 개찰결과·수수료를 자동 계산
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { g2bParseDate } from "@/lib/g2b";

export const maxDuration = 120;

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Vercel cron 또는 관리자 수동 실행만 허용
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return runFillBidResults();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return runFillBidResults();
}

async function runFillBidResults(): Promise<NextResponse> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  // 1. 마감 지났으나 결과 미입력 BidRequest 조회 (최대 200건)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pending, error: pendingErr } = await (admin.from("BidRequest") as any)
    .select("id,userId,konepsId,budget,recommendedBidPrice,predictedSajungRate")
    .lt("deadline", now)
    .is("isWon", null)
    .limit(200);

  if (pendingErr) {
    console.error("[fill-bid-results] BidRequest 조회 오류:", pendingErr.message);
    return NextResponse.json({ error: pendingErr.message }, { status: 500 });
  }
  if (!pending || pending.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, message: "처리 대상 없음" });
  }

  // 2. konepsId 목록으로 BidResult + BidOpeningDetail 병렬 배치 조회
  // BidResult: getScsbidListSttus* (일반 입찰)
  // BidOpeningDetail: getOpengResultListInfo* (수의계약 포함 모든 개찰)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const konepsIds = [...new Set(pending.map((r: any) => r.konepsId).filter(Boolean))];
  const [bidResultRes, openingRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin.from("BidResult") as any)
      .select("annId,bidRate,finalPrice,numBidders,winnerName,openedAt")
      .in("annId", konepsIds),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin.from("BidOpeningDetail") as any)
      .select("annId,sucsfbidRate,bidCount,openingDate,rawJson")
      .in("annId", konepsIds),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resultMap: Record<string, any> = Object.fromEntries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (bidResultRes.data ?? []).map((r: any) => [r.annId, r])
  );
  // BidOpeningDetail 폴백 — opengCorpInfo 파싱
  // 형식: "회사명^사업자번호^대표명^금액^낙찰률"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (openingRes.data ?? []) as any[]) {
    if (resultMap[o.annId]) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr = (o.rawJson || []) as any[];
    if (!arr.length) continue;
    const first = arr[0];
    const info = String(first.opengCorpInfo || "");
    const parts = info.split("^");
    if (parts.length < 5) continue;
    const finalPrice = parts[3]?.replace(/[^0-9]/g, "") || "0";
    if (finalPrice === "0") continue;
    resultMap[o.annId] = {
      annId: o.annId,
      bidRate: (o.sucsfbidRate ?? parseFloat(parts[4] || "0") ?? 0).toString(),
      finalPrice,
      numBidders: parseInt((first.prtcptCnum || o.bidCount || "0").toString().replace(/[^0-9]/g, ""), 10),
      winnerName: parts[0]?.trim() || null,
      openedAt: o.openingDate ? new Date(o.openingDate).toISOString() : (first.opengDt ? g2bParseDate(first.opengDt) : null),
    };
  }

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

  // 사정율 기준 = Announcement.bsisAmt (BidRequest.budget 무시)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: anns } = await (admin.from("Announcement") as any)
    .select("konepsId,bsisAmt,budget,aValueAmt")
    .in("konepsId", konepsIds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const annMap: Record<string, number> = Object.fromEntries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (anns ?? []).map((a: any) => {
      const bsis = Number(a.bsisAmt ?? 0);
      const avAmt = Number(a.aValueAmt ?? 0);
      const bud = Number(a.budget ?? 0);
      return [a.konepsId, bsis > 0 ? bsis : avAmt > 0 ? avAmt : Math.round(bud * 1.1)];
    })
  );

  // 4. 각 BidRequest 업데이트
  let updated = 0;
  let skipped = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const req of pending as any[]) {
    const res = resultMap[req.konepsId];
    if (!res) { skipped++; continue; }

    const bizName: string = userMap[req.userId] ?? "";
    const winnerName: string = res.winnerName ?? "";

    // 낙찰 여부: 회사명 ↔ 낙찰업체명 문자열 포함 비교
    const isWon: boolean =
      bizName.length > 1 && winnerName.length > 1
        ? winnerName.includes(bizName) || bizName.includes(winnerName)
        : false;

    // 사정율 = 예정가 / 기초금액 × 100. 기초금액은 Announcement.bsisAmt 우선
    const baseAmount = annMap[req.konepsId] ?? Number(req.budget ?? 0);
    const finalPrice = Number(res.finalPrice ?? 0);
    const bidRate = Number(res.bidRate ?? 0);
    const actualSajungRate =
      baseAmount > 0 && bidRate > 0
        ? (finalPrice / (bidRate / 100) / baseAmount) * 100
        : null;

    // 예측 오차 & 적중 여부
    const predictedSajung = Number(req.predictedSajungRate ?? 0);
    const deviationPct =
      actualSajungRate != null && predictedSajung > 0
        ? Math.abs(predictedSajung - actualSajungRate)
        : null;
    const isHit = deviationPct != null ? deviationPct <= 0.5 : null;

    // 수수료 계산 (낙찰 시에만)
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
      console.error("[fill-bid-results] 업데이트 오류:", req.id, updateErr.message);
    } else {
      updated++;
    }
  }

  console.log(`[fill-bid-results] 완료: 처리 ${pending.length}건, 업데이트 ${updated}건, BidResult 없음 ${skipped}건`);
  return NextResponse.json({
    ok: true,
    total: pending.length,
    updated,
    skipped,
  });
}
