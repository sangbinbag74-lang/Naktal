/**
 * Vercel Cron — SajungRateStat 사정율 통계 재집계
 * 매일 새벽 4시 KST (19:00 UTC) 실행
 *
 * collect-sajung-stat.ts 로직을 Next.js API Route로 포팅
 * (Vercel 서버리스 함수로 실행, 외부 프로세스 불필요)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { createHash } from "crypto";

export const maxDuration = 300;

const PAGE_SIZE = 1000;
const SAJUNG_MIN = 97;
const SAJUNG_MAX = 103;

function statKey(orgName: string, category: string, budgetRange: string, region: string): string {
  const h = createHash("md5").update(`${orgName}|${category}|${budgetRange}|${region}`).digest("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
}

function classifyBudget(budget: number): string {
  if (budget < 50_000_000)   return "5000만미만";
  if (budget < 100_000_000)  return "5000만~1억";
  if (budget < 300_000_000)  return "1억~3억";
  if (budget < 500_000_000)  return "3억~5억";
  if (budget < 1_000_000_000) return "5억~10억";
  return "10억이상";
}

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const vlo = sorted[lo] ?? 0;
  const vhi = sorted[hi] ?? 0;
  return lo === hi ? vlo : vlo + (idx - lo) * (vhi - vlo);
}

function calcMode(rates: number[]): number {
  const buckets: Record<number, number> = {};
  for (const r of rates) {
    const b = Math.round(r * 10) / 10;
    buckets[b] = (buckets[b] ?? 0) + 1;
  }
  return parseFloat(Object.entries(buckets).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "0");
}

function calcStats(rates: number[], months: number[]) {
  const n = rates.length;
  const sorted = [...rates].sort((a, b) => a - b);
  const avg = rates.reduce((s, v) => s + v, 0) / n;
  const variance = rates.reduce((s, v) => s + (v - avg) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);

  const monthMap: Record<string, number[]> = {};
  for (let i = 0; i < n; i++) {
    const m = String(months[i]);
    if (!monthMap[m]) monthMap[m] = [];
    monthMap[m]!.push(rates[i] ?? 0);
  }
  const monthlyAvg: Record<string, number> = {};
  for (const [m, arr] of Object.entries(monthMap)) {
    monthlyAvg[m] = Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 100) / 100;
  }

  return {
    avg:       Math.round(avg * 100) / 100,
    stddev:    Math.round(stddev * 100) / 100,
    p25:       Math.round(percentile(sorted, 25) * 100) / 100,
    p50:       Math.round(percentile(sorted, 50) * 100) / 100,
    p75:       Math.round(percentile(sorted, 75) * 100) / 100,
    min:       Math.round((sorted[0] ?? 0) * 100) / 100,
    max:       Math.round((sorted[n - 1] ?? 0) * 100) / 100,
    mode:      calcMode(rates),
    monthlyAvg,
    sampleSize: n,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Vercel Cron secret 검증
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const startedAt = Date.now();

  try {
    // ─── 1. BidResult 전체 수집 ─────────────────────────────────────────────
    const bidResults: { annId: string; bidRate: string; finalPrice: string }[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await admin
        .from("BidResult")
        .select("annId,bidRate,finalPrice")
        .range(from, from + PAGE_SIZE - 1);
      if (error || !data || data.length === 0) break;
      bidResults.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    if (bidResults.length === 0) {
      return NextResponse.json({ message: "BidResult 없음", upserted: 0 });
    }

    // ─── 2. Announcement 배치 조회 ──────────────────────────────────────────
    const annIds = [...new Set(bidResults.map((r) => r.annId))];
    const annMap = new Map<string, { orgName: string; category: string; region: string; budget: string; deadline: string }>();

    for (let i = 0; i < annIds.length; i += 500) {
      const chunk = annIds.slice(i, i + 500);
      const { data } = await admin
        .from("Announcement")
        .select("konepsId,orgName,category,region,budget,deadline")
        .in("konepsId", chunk);
      for (const a of data ?? []) annMap.set(a.konepsId, a);
    }

    // ─── 3. 사정율 계산 + 그룹화 ───────────────────────────────────────────
    interface GroupData { rates: number[]; months: number[]; }
    const groups = new Map<string, GroupData>();

    for (const row of bidResults) {
      const ann = annMap.get(row.annId);
      if (!ann) continue;
      const bidRate = parseFloat(row.bidRate);
      const finalPrice = parseFloat(row.finalPrice);
      const budget = parseFloat(ann.budget);
      if (!bidRate || !finalPrice || !budget || bidRate <= 0) continue;

      const estimatedPrice = finalPrice / (bidRate / 100);
      const sajungRate = (estimatedPrice / budget) * 100;
      if (sajungRate < SAJUNG_MIN || sajungRate > SAJUNG_MAX) continue;

      const month = new Date(ann.deadline).getMonth() + 1;
      const budgetRange = classifyBudget(budget);
      const key = `${ann.orgName}|${ann.category}|${budgetRange}|${ann.region}`;
      if (!groups.has(key)) groups.set(key, { rates: [], months: [] });
      groups.get(key)!.rates.push(sajungRate);
      groups.get(key)!.months.push(month);
    }

    // ─── 4. 레코드 빌드 ──────────────────────────────────────────────────────
    const records: object[] = [];
    const now = new Date().toISOString();

    for (const [key, gdata] of groups) {
      if (gdata.rates.length < 3) continue;
      const [orgName = "", category = "", budgetRange = "", region = ""] = key.split("|");
      records.push({ id: statKey(orgName, category, budgetRange, region), orgName, category, budgetRange, region, updatedAt: now, ...calcStats(gdata.rates, gdata.months) });
    }

    // ALL 폴백 집계
    const allGroups = new Map<string, GroupData>();
    for (const [key, gdata] of groups) {
      const parts = key.split("|");
      const catKey = `ALL|${parts[1]}|${parts[2]}|${parts[3]}`;
      if (!allGroups.has(catKey)) allGroups.set(catKey, { rates: [], months: [] });
      allGroups.get(catKey)!.rates.push(...gdata.rates);
      allGroups.get(catKey)!.months.push(...gdata.months);
    }
    for (const [key, gdata] of allGroups) {
      if (gdata.rates.length < 5) continue;
      const [orgName = "", category = "", budgetRange = "", region = ""] = key.split("|");
      records.push({ id: statKey(orgName, category, budgetRange, region), orgName, category, budgetRange, region, updatedAt: now, ...calcStats(gdata.rates, gdata.months) });
    }

    // ─── 5. 배치 upsert ──────────────────────────────────────────────────────
    let upserted = 0;
    const BATCH = 500;
    for (let i = 0; i < records.length; i += BATCH) {
      const { error } = await admin
        .from("SajungRateStat")
        .upsert(records.slice(i, i + BATCH), { onConflict: "orgName,category,budgetRange,region" });
      if (!error) upserted += Math.min(BATCH, records.length - i);
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    return NextResponse.json({ message: "완료", upserted, elapsed: `${elapsed}s` });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[collect-sajung-stat cron]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
