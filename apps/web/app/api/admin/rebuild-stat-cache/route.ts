/**
 * POST /api/admin/rebuild-stat-cache
 * BidResult → NumberSelectionStat + OrgBiddingPattern 재집계
 * 인증: x-admin-key 헤더 또는 Authorization Bearer
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

const PAGE_SIZE = 5000;
const MIN_ORG_SAMPLE = 10;

// ─── 분류 함수 ───────────────────────────────────────────────────────────────

function classifyBudget(budget: number): string {
  if (budget < 100_000_000)   return "1억미만";
  if (budget < 300_000_000)   return "1억-3억";
  if (budget < 1_000_000_000) return "3억-10억";
  if (budget < 3_000_000_000) return "10억-30억";
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

// ─── 집계 로직 ───────────────────────────────────────────────────────────────

async function rebuildStatCache(db: ReturnType<typeof createClient>) {
  type StatKey = string;
  interface StatAccum { category: string; budgetRange: string; region: string; bidderRange: string; rateInt: number; winCount: number; }
  const statAccum = new Map<StatKey, StatAccum>();
  const orgRates  = new Map<string, string[]>();

  let page = 0, total = 0;
  while (true) {
    const { data, error } = await db
      .from("BidResult")
      .select("bidRate, numBidders, Announcement!inner(category, region, budget, orgName)")
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error || !data || data.length === 0) break;

    for (const row of (data as any[])) {
      const ann = (row as any).Announcement;
      if (!ann) continue;

      // — NumberSelectionStat 집계
      const md = extractMillidigit(String(row.bidRate));
      if (md !== null) {
        const budget      = parseInt(String(ann.budget ?? "0").replace(/[^0-9]/g, ""), 10) || 0;
        const category    = (ann.category || "기타").split(" ")[0].trim().slice(0, 20);
        const region      = ann.region || "기타";
        const budgetRange = classifyBudget(budget);
        const bidderRange = classifyBidders(row.numBidders || 0);
        const key: StatKey = `${category}|${budgetRange}|${region}|${bidderRange}|${md}`;
        const s = statAccum.get(key);
        if (s) s.winCount++;
        else statAccum.set(key, { category, budgetRange, region, bidderRange, rateInt: md, winCount: 1 });
      }

      // — OrgBiddingPattern 집계
      if (ann.orgName) {
        const rates = orgRates.get(ann.orgName) ?? [];
        rates.push(String(row.bidRate));
        orgRates.set(ann.orgName, rates);
      }
    }

    total += data.length;
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  // ── NumberSelectionStat upsert ──────────────────────────────────────────────
  const groupTotal = new Map<string, number>();
  for (const [, stat] of statAccum) {
    const g = `${stat.category}|${stat.budgetRange}|${stat.region}|${stat.bidderRange}`;
    groupTotal.set(g, (groupTotal.get(g) ?? 0) + stat.winCount);
  }

  const statRows = Array.from(statAccum.values()).map((s) => ({
    id:          crypto.randomUUID(),
    category:    s.category,
    budgetRange: s.budgetRange,
    region:      s.region,
    bidderRange: s.bidderRange,
    rateInt:     s.rateInt,
    winCount:    s.winCount,
    totalCount:  groupTotal.get(`${s.category}|${s.budgetRange}|${s.region}|${s.bidderRange}`) ?? s.winCount,
    updatedAt:   new Date().toISOString(),
  }));

  let statUpserted = 0;
  for (let i = 0; i < statRows.length; i += 1000) {
    const { error } = await (db.from("NumberSelectionStat") as any)
      .upsert(statRows.slice(i, i + 1000), { onConflict: "category,budgetRange,region,bidderRange,rateInt" });
    if (!error) statUpserted += Math.min(1000, statRows.length - i);
  }

  // ── OrgBiddingPattern upsert ────────────────────────────────────────────────
  const eligible = Array.from(orgRates.entries()).filter(([, r]) => r.length >= MIN_ORG_SAMPLE);
  const orgRows = eligible.map(([orgName, bidRates]) => {
    const freqMap: Record<number, number>  = {};
    for (const rate of bidRates) {
      const n = parseFloat(rate.replace(/[^0-9.]/g, ""));
      if (isNaN(n) || n <= 0 || n > 100) continue;
      const md = Math.round((n % 1) * 1000) % 1000;
      freqMap[md] = (freqMap[md] ?? 0) + 1;
    }
    const total2   = Object.values(freqMap).reduce((s, v) => s + v, 0);
    const freqPct: Record<number, number>  = {};
    const deviation: Record<number, number> = {};
    const avg = total2 > 0 ? total2 / 1000 : 0;
    for (const [k, v] of Object.entries(freqMap)) {
      const ki = parseInt(k);
      freqPct[ki]   = parseFloat(((v / total2) * 100).toFixed(2));
      deviation[ki] = parseFloat(((v / total2 - avg / total2) * 100).toFixed(2));
    }
    return { id: crypto.randomUUID(), orgName, freqMap: freqPct, deviation, sampleSize: bidRates.length, updatedAt: new Date().toISOString() };
  });

  let orgUpserted = 0;
  for (let i = 0; i < orgRows.length; i += 50) {
    const { error } = await (db.from("OrgBiddingPattern") as any)
      .upsert(orgRows.slice(i, i + 50), { onConflict: "orgName" });
    if (!error) orgUpserted += Math.min(50, orgRows.length - i);
  }

  return { totalBidResults: total, statRows: statUpserted, orgPatterns: orgUpserted };
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const adminKey = process.env.ADMIN_SECRET_KEY;
  const token = req.headers.get("x-admin-key") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (!adminKey || token !== adminKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Supabase 환경변수 누락" }, { status: 500 });
  }

  try {
    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const result = await rebuildStatCache(db as any);
    console.log("[rebuild-stat-cache]", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[rebuild-stat-cache]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
