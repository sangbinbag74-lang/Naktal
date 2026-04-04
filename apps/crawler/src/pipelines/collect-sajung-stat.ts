/**
 * SajungRateStat 집계 배치
 *
 * BidResult + Announcement JOIN → 사정율 계산 → 발주처·업종·예산·지역별 통계
 * → SajungRateStat 테이블 upsert
 *
 * 사정율 = 예정가격 ÷ 기초금액 × 100
 * 예정가격 = 낙찰금액 ÷ (낙찰률 ÷ 100)
 * 유효 범위: 97~103%
 *
 * 실행: pnpm ts-node src/pipelines/collect-sajung-stat.ts
 */

import * as path from "path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

/** orgName|category|budgetRange|region → 결정론적 UUID (MD5 기반) */
function statKey(orgName: string, category: string, budgetRange: string, region: string): string {
  const h = createHash("md5").update(`${orgName}|${category}|${budgetRange}|${region}`).digest("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
}

// .env.local 로드
function loadEnv(): void {
  const envPath = path.resolve(__dirname, "../../../web/.env.local");
  try {
    const content = require("fs").readFileSync(envPath, "utf-8") as string;
    for (const line of content.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim();
      if (k && !process.env[k]) process.env[k] = v;
    }
  } catch { /* 환경변수에서 직접 읽음 */ }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 누락");
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const PAGE_SIZE = 1000; // Supabase PostgREST 기본 max-rows
// 물품/용역은 97~103%, 공사는 복수예가로 105~115% → 전체 커버
const SAJUNG_MIN = 85;
const SAJUNG_MAX = 125;

// ─── 분류 ─────────────────────────────────────────────────────────────────────

function classifyBudget(budget: number): string {
  if (budget < 100_000_000)   return "1억미만";
  if (budget < 300_000_000)   return "1억-3억";
  if (budget < 1_000_000_000) return "3억-10억";
  if (budget < 3_000_000_000) return "10억-30억";
  return "30억이상";
}

// ─── 통계 계산 ────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo  = Math.floor(idx);
  const hi  = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function calcMode(values: number[]): number {
  // 소수 1자리 반올림으로 최빈값
  const counts: Record<string, number> = {};
  for (const v of values) {
    const key = (Math.round(v * 10) / 10).toFixed(1);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  let maxKey = "98.5";
  let maxCnt = 0;
  for (const [k, c] of Object.entries(counts)) {
    if (c > maxCnt) { maxCnt = c; maxKey = k; }
  }
  return parseFloat(maxKey);
}

interface GroupStats {
  avg: number; stddev: number; p25: number; p50: number; p75: number;
  min: number; max: number; mode: number;
  monthlyAvg: Record<string, number>;
  sampleSize: number;
}

function calcStats(rates: number[], months: number[]): GroupStats {
  const n = rates.length;
  const avg = rates.reduce((s, v) => s + v, 0) / n;
  const variance = rates.reduce((s, v) => s + (v - avg) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);

  const sorted = [...rates].sort((a, b) => a - b);

  // 월별 평균
  const monthMap: Record<string, number[]> = {};
  for (let i = 0; i < n; i++) {
    const m = String(months[i]);
    if (!monthMap[m]) monthMap[m] = [];
    monthMap[m].push(rates[i]);
  }
  const monthlyAvg: Record<string, number> = {};
  for (const [m, arr] of Object.entries(monthMap)) {
    monthlyAvg[m] = Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 100) / 100;
  }

  return {
    avg: Math.round(avg * 100) / 100,
    stddev: Math.round(stddev * 100) / 100,
    p25: Math.round(percentile(sorted, 25) * 100) / 100,
    p50: Math.round(percentile(sorted, 50) * 100) / 100,
    p75: Math.round(percentile(sorted, 75) * 100) / 100,
    min: Math.round(sorted[0] * 100) / 100,
    max: Math.round(sorted[n - 1] * 100) / 100,
    mode: calcMode(rates),
    monthlyAvg,
    sampleSize: n,
  };
}

// ─── 데이터 수집 ──────────────────────────────────────────────────────────────

type BidRow = {
  annId: string;
  bidRate: string;
  finalPrice: string;
  Announcement: { orgName: string; category: string; region: string; budget: string; deadline: string } | null;
};

async function fetchAllBidRows(): Promise<BidRow[]> {
  // 1단계: BidResult 수집
  const bidResults: { annId: string; bidRate: string; finalPrice: string }[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("BidResult")
      .select("annId,bidRate,finalPrice")
      .range(from, from + PAGE_SIZE - 1);
    if (error) { console.error("BidResult 조회 오류:", error.message); break; }
    if (!data || data.length === 0) break;
    bidResults.push(...data);
    console.log(`  BidResult ${bidResults.length}건 수집 중...`);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  if (bidResults.length === 0) return [];

  // 2단계: Announcement 배치 조회 (annId → konepsId 기준)
  const annIds = [...new Set(bidResults.map((r) => r.annId))];
  const annMap = new Map<string, { orgName: string; category: string; region: string; budget: string; deadline: string }>();

  for (let i = 0; i < annIds.length; i += 500) {
    const chunk = annIds.slice(i, i + 500);
    const { data, error } = await supabase
      .from("Announcement")
      .select("konepsId,orgName,category,region,budget,deadline")
      .in("konepsId", chunk);
    if (error) { console.error("Announcement 조회 오류:", error.message); continue; }
    for (const a of data ?? []) annMap.set(a.konepsId, a);
    console.log(`  Announcement ${annMap.size}/${annIds.length}건 매핑 중...`);
  }

  // 3단계: 조인
  return bidResults.map((r) => ({
    annId: r.annId,
    bidRate: r.bidRate,
    finalPrice: r.finalPrice,
    Announcement: annMap.get(r.annId) ?? null,
  }));
}

// ─── 집계 ─────────────────────────────────────────────────────────────────────

interface GroupKey { orgName: string; category: string; budgetRange: string; region: string; }
interface GroupData { rates: number[]; months: number[]; }

async function buildStats(): Promise<void> {
  console.log("=== SajungRateStat 집계 시작 ===");

  const rows = await fetchAllBidRows();
  console.log(`총 ${rows.length}건 낙찰결과 수집`);

  // 사정율 계산 + 유효범위 필터
  const groups = new Map<string, GroupData>();
  const allRates: number[] = [];
  const allMonths: number[] = [];

  let valid = 0;
  let skipped = 0;

  for (const row of rows) {
    const ann = row.Announcement;
    if (!ann) { skipped++; continue; }

    const bidRate = parseFloat(row.bidRate);
    const finalPrice = parseFloat(row.finalPrice);
    const budget = parseFloat(ann.budget);

    if (!bidRate || !finalPrice || !budget || bidRate <= 0) { skipped++; continue; }

    // 예정가격 = 낙찰금액 ÷ (낙찰률 ÷ 100)
    const estimatedPrice = finalPrice / (bidRate / 100);
    const sajungRate = (estimatedPrice / budget) * 100;

    // 유효 범위 97~103%
    if (sajungRate < SAJUNG_MIN || sajungRate > SAJUNG_MAX) { skipped++; continue; }

    const deadline = new Date(ann.deadline);
    const month = deadline.getMonth() + 1;
    const budgetRange = classifyBudget(budget);

    const key = `${ann.orgName}|${ann.category}|${budgetRange}|${ann.region}`;
    if (!groups.has(key)) groups.set(key, { rates: [], months: [] });
    groups.get(key)!.rates.push(sajungRate);
    groups.get(key)!.months.push(month);

    allRates.push(sajungRate);
    allMonths.push(month);
    valid++;
  }

  console.log(`유효 데이터: ${valid}건, 제외: ${skipped}건`);
  console.log(`그룹 수: ${groups.size}`);

  // SajungRateStat upsert
  const records = [];

  for (const [key, gdata] of groups) {
    if (gdata.rates.length < 3) continue; // 최소 3건 이상인 그룹만
    const [orgName, category, budgetRange, region] = key.split("|");
    const stats = calcStats(gdata.rates, gdata.months);
    const now = new Date().toISOString();
    records.push({ id: statKey(orgName, category, budgetRange, region), orgName, category, budgetRange, region, updatedAt: now, ...stats });
  }

  // 전체 평균 ('ALL' orgName) — 카테고리+예산+지역별
  const allGroups = new Map<string, GroupData>();
  for (const [key, gdata] of groups) {
    const parts = key.split("|");
    const catKey = `ALL|${parts[1]}|${parts[2]}|${parts[3]}`;
    if (!allGroups.has(catKey)) allGroups.set(catKey, { rates: [], months: [] });
    allGroups.get(catKey)!.rates.push(...gdata.rates);
    allGroups.get(catKey)!.months.push(...gdata.months);
  }
  const now2 = new Date().toISOString();
  for (const [key, gdata] of allGroups) {
    if (gdata.rates.length < 5) continue;
    const [orgName, category, budgetRange, region] = key.split("|");
    const stats = calcStats(gdata.rates, gdata.months);
    records.push({ id: statKey(orgName, category, budgetRange, region), orgName, category, budgetRange, region, updatedAt: now2, ...stats });
  }

  console.log(`총 ${records.length}개 레코드 upsert 예정`);

  // 배치 upsert (500건씩)
  const BATCH = 500;
  let upserted = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const { error } = await supabase
      .from("SajungRateStat")
      .upsert(batch, { onConflict: "orgName,category,budgetRange,region" });
    if (error) console.error(`배치 upsert 오류 (${i}~${i + BATCH}):`, error.message);
    else upserted += batch.length;
    console.log(`  ${upserted} / ${records.length} upsert 완료`);
  }

  console.log(`=== 완료: ${upserted}개 SajungRateStat 저장 ===`);
}

buildStats().catch((err) => {
  console.error("치명적 오류:", err);
  process.exit(1);
});
