import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  calcSajung,
  buildBudgetMap,
  fetchOrgKonepsIds,
  roundBucket,
} from "@/lib/analysis/sajung-utils";
import { getCachedAnalysis, setCachedAnalysis, periodToDate } from "@/lib/analysis/sajung-cache";

export interface HistogramBucket {
  rate: number;
  count: number;
  pct: number;
  cumPct: number;
}

export interface SajungHistogramResponse {
  histogram: HistogramBucket[];
  sampleSize: number;
  stats: {
    avg: number;
    mode: number;
    p25: number;
    p50: number;
    p75: number;
    stddev: number;
  };
  lowerLimitRate: number;
  fromCache?: boolean;
}

function emptyResponse(lowerLimitRate: number): NextResponse {
  return NextResponse.json<SajungHistogramResponse>({
    histogram: [],
    sampleSize: 0,
    stats: { avg: 103.8, mode: 103.8, p25: 101, p50: 103, p75: 106, stddev: 1.5 },
    lowerLimitRate,
  });
}

async function buildHistogramResponse(
  results: { finalPrice: number | string; bidRate: number | string; annId: string }[],
  admin: ReturnType<typeof createAdminClient>,
  lowerLimitRate: number,
): Promise<SajungHistogramResponse | null> {
  if (results.length === 0) return null;

  const uniqueAnnIds = [...new Set(results.map((r) => r.annId).filter(Boolean))];
  const budgetMap = await buildBudgetMap(admin, uniqueAnnIds);

  const rates: number[] = [];
  for (const r of results) {
    const sajung = calcSajung(Number(r.finalPrice), Number(r.bidRate), budgetMap.get(r.annId) ?? 0);
    if (sajung >= 85 && sajung <= 125) rates.push(roundBucket(sajung));
  }

  if (rates.length === 0) return null;
  rates.sort((a, b) => a - b);

  const bucketMap = new Map<number, number>();
  for (const r of rates) bucketMap.set(r, (bucketMap.get(r) ?? 0) + 1);

  const keys = Array.from(bucketMap.keys()).sort((a, b) => a - b);
  const minKey = keys[0] ?? 85;
  const maxKey = keys[keys.length - 1] ?? 125;

  const histogram: HistogramBucket[] = [];
  let cumCount = 0;
  const total = rates.length;

  let rr = minKey;
  while (rr <= maxKey + 0.001) {
    const key = roundBucket(rr);
    const count = bucketMap.get(key) ?? 0;
    cumCount += count;
    histogram.push({
      rate: key,
      count,
      pct: Math.round((count / total) * 1000) / 10,
      cumPct: Math.round((cumCount / total) * 1000) / 10,
    });
    rr = roundBucket(rr + 0.1);
  }

  const avg = rates.reduce((s, v) => s + v, 0) / total;
  const variance = rates.reduce((s, v) => s + (v - avg) ** 2, 0) / total;
  const stddev = Math.sqrt(variance);
  const p25 = rates[Math.floor(total * 0.25)] ?? avg;
  const p50 = rates[Math.floor(total * 0.5)] ?? avg;
  const p75 = rates[Math.floor(total * 0.75)] ?? avg;

  let modeKey = keys[0] ?? avg;
  let modeCount = 0;
  for (const [k, v] of bucketMap) {
    if (v > modeCount) { modeCount = v; modeKey = k; }
  }

  return {
    histogram,
    sampleSize: total,
    stats: {
      avg: Math.round(avg * 100) / 100,
      mode: modeKey,
      p25: Math.round(p25 * 100) / 100,
      p50: Math.round(p50 * 100) / 100,
      p75: Math.round(p75 * 100) / 100,
      stddev: Math.round(stddev * 100) / 100,
    },
    lowerLimitRate,
  };
}

export async function GET(req: NextRequest) {
  const annId = req.nextUrl.searchParams.get("annId");
  const period = req.nextUrl.searchParams.get("period") ?? "3y";
  if (!annId) return NextResponse.json({ error: "annId required" }, { status: 400 });

  // ── 캐시 확인 ──────────────────────────────────────────────────────────────
  const cached = await getCachedAnalysis(annId, period, "histogram");
  if (cached) return NextResponse.json({ ...cached, fromCache: true });

  const admin = createAdminClient();

  const { data: ann } = await admin
    .from("Announcement")
    .select("id, konepsId, orgName, category, rawJson")
    .eq("id", annId)
    .single();

  if (!ann) return NextResponse.json({ error: "Announcement not found" }, { status: 404 });

  const rawJson = (ann.rawJson ?? {}) as Record<string, string>;
  const lwltStr = rawJson.sucsfbidLwltRate ?? "";
  const lowerLimitRate = parseFloat(lwltStr.replace(/[^0-9.]/g, "")) || 87.745;

  const sinceDate = periodToDate(period);

  // ── Direct 조회 ─────────────────────────────────────────────────────────────
  let directQ = admin
    .from("BidResult")
    .select("finalPrice, bidRate, annId")
    .eq("annId", ann.konepsId as string)
    .gt("bidRate", 0)
    .gt("finalPrice", 0)
    .limit(2000);
  if (sinceDate) directQ = directQ.gte("createdAt", sinceDate);

  const { data: directResults } = await directQ;
  const directRows = directResults ?? [];

  let result: SajungHistogramResponse | null = null;

  if (directRows.length > 0) {
    result = await buildHistogramResponse(directRows, admin, lowerLimitRate);
  } else {
    const konepsIds = await fetchOrgKonepsIds(admin, ann.orgName as string, ann.category as string);
    if (konepsIds.length > 0) {
      let fallbackQ = admin
        .from("BidResult")
        .select("finalPrice, bidRate, annId")
        .in("annId", konepsIds)
        .gt("bidRate", 0)
        .gt("finalPrice", 0)
        .limit(2000);
      if (sinceDate) fallbackQ = fallbackQ.gte("createdAt", sinceDate);

      const { data: fallback } = await fallbackQ;
      result = await buildHistogramResponse(fallback ?? [], admin, lowerLimitRate);
    }
  }

  if (!result) return emptyResponse(lowerLimitRate);

  // ── 캐시 저장 ──────────────────────────────────────────────────────────────
  await setCachedAnalysis(annId, period, "histogram", result , result.sampleSize);

  return NextResponse.json<SajungHistogramResponse>(result);
}
