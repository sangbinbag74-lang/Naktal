/**
 * 개찰 결과 자동 수집 파이프라인
 * 개찰일이 지난 BidOutcome(PENDING) → KONEPS API로 결과 자동 업데이트
 * pg_cron: 매일 18:00 KST
 */

import { getBidResultDetail } from "../api/koneps-client";
import { createClient } from "@supabase/supabase-js";
import Decimal from "decimal.js";

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase 환경변수 누락");
  return createClient(url, key);
}

function classifyResult(
  bidRate: number,
  actualRate: number,
  numBidders: number,
): "WIN" | "LOSE" {
  // 낙찰률 기준: 실제 낙찰률에서 ±0.005% 이내면 WIN (단순 근사)
  return Math.abs(bidRate - actualRate) < 0.005 ? "WIN" : "LOSE";
}

export async function collectAutoOutcomes(): Promise<{ updated: number; skipped: number }> {
  const db = supabase();
  let updated = 0;
  let skipped = 0;

  // PENDING 상태이고 bidAt이 1일 이상 지난 것
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: pending } = await db
    .from("BidOutcome")
    .select("id,annId,bidRate,selectedNos,recommendationId")
    .eq("result", "PENDING")
    .lt("bidAt", yesterday)
    .limit(50);

  if (!pending?.length) return { updated: 0, skipped: 0 };

  for (const outcome of pending) {
    const detail = await getBidResultDetail(outcome.annId).catch(() => null);
    if (!detail) { skipped++; continue; }

    const actualRate = parseFloat(detail.sucsfbidRate?.replace(/[^0-9.]/g, "") || "0");
    const numBidders = parseInt(detail.totPrtcptCo || "0", 10);
    const bidRate = parseFloat(String(outcome.bidRate));

    if (!actualRate) { skipped++; continue; }

    const result = classifyResult(bidRate, actualRate, numBidders);

    // 추천 번호 적중 여부 재계산
    let recommendHit: boolean | null = null;
    if (outcome.recommendationId) {
      const { data: rec } = await db
        .from("NumberRecommendation")
        .select("combo1,combo2,combo3")
        .eq("id", outcome.recommendationId)
        .maybeSingle();
      if (rec) {
        const allRec = [...(rec.combo1 ?? []), ...(rec.combo2 ?? []), ...(rec.combo3 ?? [])];
        recommendHit = outcome.selectedNos.some((n: number) => allRec.includes(n));
      }
    }

    await db.from("BidOutcome").update({
      result,
      actualBidRate: new Decimal(actualRate).toFixed(4),
      numBidders,
      recommendHit,
      openedAt: new Date().toISOString(),
    }).eq("id", outcome.id);

    updated++;
    await new Promise((r) => setTimeout(r, 300));
  }

  return { updated, skipped };
}
