/**
 * NumberSelectionStat 집계 배치
 *
 * BidResult + Announcement JOIN → 카테고리/예산/지역/입찰자수 기준 millidigit 빈도 집계
 * → NumberSelectionStat 테이블 upsert
 *
 * 실행: ts-node src/pipelines/build-stat-cache.ts
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 누락");
  process.exit(1);
}

const PAGE_SIZE = 5000;

// ─── 분류 함수 ───────────────────────────────────────────────────────────────

function classifyBudget(budget: number): string {
  if (budget < 100_000_000)          return "1억미만";
  if (budget < 300_000_000)          return "1억-3억";
  if (budget < 1_000_000_000)        return "3억-10억";
  if (budget < 3_000_000_000)        return "10억-30억";
  return "30억이상";
}

function classifyBidders(n: number): string {
  if (n <= 5)  return "1-5";
  if (n <= 10) return "6-10";
  if (n <= 20) return "11-20";
  if (n <= 50) return "21-50";
  return "51+";
}

function extractMillidigit(rate: string): number | null {
  const n = parseFloat(rate.replace(/[^0-9.]/g, ""));
  if (isNaN(n) || n <= 0 || n > 100) return null;
  return Math.round((n % 1) * 1000) % 1000;
}

// ─── 집계 키 ─────────────────────────────────────────────────────────────────

type StatKey = string; // "category|budgetRange|region|bidderRange|rateInt"

interface StatAccum {
  category: string;
  budgetRange: string;
  region: string;
  bidderRange: string;
  rateInt: number;
  winCount: number;
}

// ─── 메인 ────────────────────────────────────────────────────────────────────

async function run() {
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  console.log("[build-stat-cache] BidResult 집계 시작...");

  const accum = new Map<StatKey, StatAccum>();
  let page = 0;
  let totalFetched = 0;

  while (true) {
    const { data, error } = await db
      .from("BidResult")
      .select("bidRate, numBidders, Announcement!inner(category, region, budget)")
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) {
      console.error("[build-stat-cache] BidResult 조회 오류:", error.message);
      break;
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      const ann = (row as any).Announcement;
      if (!ann) continue;

      const md = extractMillidigit(String(row.bidRate));
      if (md === null) continue;

      const budget     = parseInt(String(ann.budget).replace(/[^0-9]/g, ""), 10) || 0;
      const category   = (ann.category || "기타").split(" ")[0].trim().slice(0, 20);
      const region     = ann.region || "기타";
      const budgetRange  = classifyBudget(budget);
      const bidderRange  = classifyBidders(row.numBidders || 0);

      const key: StatKey = `${category}|${budgetRange}|${region}|${bidderRange}|${md}`;

      const existing = accum.get(key);
      if (existing) {
        existing.winCount++;
      } else {
        accum.set(key, { category, budgetRange, region, bidderRange, rateInt: md, winCount: 1 });
      }
    }

    totalFetched += data.length;
    console.log(`  페이지 ${page + 1}: ${data.length}건 처리 (누적 ${totalFetched})`);

    if (data.length < PAGE_SIZE) break;
    page++;
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`[build-stat-cache] 집계 완료: ${totalFetched}건 → ${accum.size}개 통계 항목`);

  if (accum.size === 0) {
    console.log("[build-stat-cache] 집계할 데이터 없음. 종료.");
    return;
  }

  // totalCount 계산: 같은 category|budgetRange|region|bidderRange 그룹의 합
  const groupTotal = new Map<string, number>();
  for (const [key, stat] of accum) {
    const groupKey = `${stat.category}|${stat.budgetRange}|${stat.region}|${stat.bidderRange}`;
    groupTotal.set(groupKey, (groupTotal.get(groupKey) ?? 0) + stat.winCount);
  }

  // Upsert 배치 (1000건씩)
  const rows = Array.from(accum.values()).map((stat) => {
    const groupKey = `${stat.category}|${stat.budgetRange}|${stat.region}|${stat.bidderRange}`;
    return {
      id:          crypto.randomUUID(),
      category:    stat.category,
      budgetRange: stat.budgetRange,
      region:      stat.region,
      bidderRange: stat.bidderRange,
      rateInt:     stat.rateInt,
      winCount:    stat.winCount,
      totalCount:  groupTotal.get(groupKey) ?? stat.winCount,
      updatedAt:   new Date().toISOString(),
    };
  });

  const BATCH = 1000;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await db
      .from("NumberSelectionStat")
      .upsert(batch, { onConflict: "category,budgetRange,region,bidderRange,rateInt" });

    if (error) console.error(`[build-stat-cache] upsert 오류 (배치 ${i / BATCH + 1}):`, error.message);
    else upserted += batch.length;

    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`[build-stat-cache] NumberSelectionStat upsert 완료: ${upserted}건`);
}

run().catch((e) => { console.error(e); process.exit(1); });
