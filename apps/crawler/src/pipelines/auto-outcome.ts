/**
 * 개찰 결과 자동 수집 파이프라인
 * 개찰일이 지난 BidOutcome(PENDING) → KONEPS API로 결과 자동 업데이트
 * + 실제 사정율 계산 → BidOutcome.actualSajungRate 저장
 * + SajungRateStat 롤링 평균 업데이트 (가중 70/30)
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
): "WIN" | "LOSE" {
  return Math.abs(bidRate - actualRate) < 0.005 ? "WIN" : "LOSE";
}

/** 사정율 계산: finalPrice / (bidRate/100) / budget × 100 */
function calcSajungRate(finalPrice: number, bidRatePct: number, budget: number): number | null {
  if (!finalPrice || !bidRatePct || !budget) return null;
  const estimatedPrice = finalPrice / (bidRatePct / 100);
  const sajung = (estimatedPrice / budget) * 100;
  if (sajung < 97 || sajung > 103) return null; // 유효범위 외 제거
  return Math.round(sajung * 10000) / 10000;
}

export async function collectAutoOutcomes(): Promise<{ updated: number; skipped: number; sajungUpdated: number }> {
  const db = supabase();
  let updated = 0;
  let skipped = 0;
  let sajungUpdated = 0;

  // PENDING 상태이고 bidAt이 1일 이상 지난 것
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: pending } = await db
    .from("BidOutcome")
    .select("id,annId,bidRate,selectedNos,recommendationId")
    .eq("result", "PENDING")
    .lt("bidAt", yesterday)
    .limit(50);

  if (!pending?.length) return { updated: 0, skipped: 0, sajungUpdated: 0 };

  // annId → Announcement(budget, orgName, category, region, budgetRange) 조회
  const annIds = [...new Set(pending.map((p) => p.annId))];
  const { data: announcements } = await db
    .from("Announcement")
    .select("id,budget,orgName,category,region")
    .in("id", annIds);
  const annMap = new Map((announcements ?? []).map((a) => [a.id, a]));

  for (const outcome of pending) {
    const detail = await getBidResultDetail(outcome.annId).catch(() => null);
    if (!detail) { skipped++; continue; }

    const actualRate = parseFloat(detail.sucsfbidRate?.replace(/[^0-9.]/g, "") || "0");
    const numBidders = parseInt(detail.totPrtcptCo || "0", 10);
    const finalPrice = parseInt((detail.sucsfbidAmt || "0").replace(/[^0-9]/g, ""), 10);
    const bidRate = parseFloat(String(outcome.bidRate));

    if (!actualRate) { skipped++; continue; }

    const result = classifyResult(bidRate, actualRate);

    // 실제 사정율 계산
    const ann = annMap.get(outcome.annId);
    const budget = ann ? Number(ann.budget) : 0;
    const actualSajungRate = finalPrice && budget ? calcSajungRate(finalPrice, actualRate, budget) : null;

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

    // G-4 피드백 루프: 실제 선택된 4개 예비가 번호 (BidOpeningDetail 조회)
    let actualOpeningIdx: number[] = [];
    const { data: opening } = await db
      .from("BidOpeningDetail")
      .select("selPrdprcIdx")
      .eq("annId", outcome.annId)
      .maybeSingle();
    if (opening?.selPrdprcIdx && Array.isArray(opening.selPrdprcIdx)) {
      actualOpeningIdx = opening.selPrdprcIdx as number[];
    }

    await db.from("BidOutcome").update({
      result,
      actualBidRate: new Decimal(actualRate).toFixed(4),
      actualFinalPrice: finalPrice > 0 ? String(finalPrice) : null,
      actualSajungRate: actualSajungRate ?? null,
      numBidders,
      actualBidders: numBidders > 0 ? numBidders : null,
      actualOpeningIdx,
      recommendHit,
      openedAt: new Date().toISOString(),
    }).eq("id", outcome.id);

    updated++;

    // SajungRateStat 롤링 업데이트 (실제 사정율 → 가중 평균 반영)
    if (actualSajungRate && ann?.orgName && ann.category && budget) {
      await updateSajungStat(db, {
        orgName: ann.orgName,
        category: ann.category,
        budget,
        region: ann.region ?? "",
        actualSajungRate,
      });
      sajungUpdated++;
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  return { updated, skipped, sajungUpdated };
}

async function updateSajungStat(
  db: ReturnType<typeof createClient>,
  params: {
    orgName: string;
    category: string;
    budget: number;
    region: string;
    actualSajungRate: number;
  }
): Promise<void> {
  const budgetRange = classifyBudget(params.budget);

  // 발주처 특화 stat 조회
  const { data: stat } = await db
    .from("SajungRateStat")
    .select("id,avg,sampleSize")
    .eq("orgName", params.orgName)
    .eq("category", params.category)
    .eq("budgetRange", budgetRange)
    .eq("region", params.region)
    .maybeSingle();

  if (!stat) return; // stat이 없으면 건너뜀 (collect-sajung-stat이 생성해야 함)

  // 가중 평균 업데이트: 기존 70% + 신규 30%
  const newAvg = stat.avg * 0.7 + params.actualSajungRate * 0.3;
  const newSampleSize = stat.sampleSize + 1;

  await db.from("SajungRateStat").update({
    avg: Math.round(newAvg * 10000) / 10000,
    sampleSize: newSampleSize,
    updatedAt: new Date().toISOString(),
  }).eq("id", stat.id);
}

function classifyBudget(budget: number): string {
  if (budget < 100_000_000)   return "1억미만";
  if (budget < 300_000_000)   return "1억-3억";
  if (budget < 1_000_000_000) return "3억-10억";
  if (budget < 3_000_000_000) return "10억-30억";
  return "30억이상";
}
