import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  calcSajung,
  buildBudgetAndDateMap,
  fetchOrgKonepsIds,
  roundBucket,
  getSajungRange,
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
  orgRange?: number;
  orgRangeMin?: number;
  orgRangeMax?: number;
  autoExpanded?: boolean;
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
  filter: { min: number; max: number },
  sinceDateStr: string | null,
): Promise<SajungHistogramResponse | null> {
  if (results.length === 0) return null;

  const uniqueAnnIds = [...new Set(results.map((r) => r.annId).filter(Boolean))];
  const infoMap = await buildBudgetAndDateMap(admin, uniqueAnnIds);

  const rates: number[] = [];
  for (const r of results) {
    const info = infoMap.get(r.annId);
    if (!info || !info.deadline) continue;
    if (sinceDateStr && info.deadline.slice(0, 10) < sinceDateStr) continue;
    const sajung = calcSajung(Number(r.finalPrice), Number(r.bidRate), info.budget);
    if (sajung >= filter.min && sajung <= filter.max) rates.push(roundBucket(sajung));
  }

  if (rates.length === 0) return null;
  rates.sort((a, b) => a - b);

  const bucketMap = new Map<number, number>();
  for (const r of rates) bucketMap.set(r, (bucketMap.get(r) ?? 0) + 1);

  const keys = Array.from(bucketMap.keys()).sort((a, b) => a - b);
  const minKey = keys[0] ?? filter.min;
  const maxKey = keys[keys.length - 1] ?? filter.max;

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
  const categoryFilter = req.nextUrl.searchParams.get("categoryFilter") ?? "same";
  const orgScope = (req.nextUrl.searchParams.get("orgScope") ?? "exact") as "exact" | "expand";
  if (!annId) return NextResponse.json({ error: "annId required" }, { status: 400 });

  // ── 캐시 확인 ──────────────────────────────────────────────────────────────
  const cacheType = `histogram_v3${categoryFilter === "all" ? "_all" : ""}${orgScope === "expand" ? "_expand" : ""}`;
  const cached = await getCachedAnalysis(annId, period, cacheType);
  if (cached) return NextResponse.json({ ...cached, fromCache: true });

  const admin = createAdminClient();

  const { data: ann } = await admin
    .from("Announcement")
    .select("id, konepsId, orgName, category, region, budget, rawJson")
    .eq("id", annId)
    .single();

  if (!ann) return NextResponse.json({ error: "Announcement not found" }, { status: 404 });

  const rawJson = (ann.rawJson ?? {}) as Record<string, string>;
  const lwltStr = rawJson.sucsfbidLwltRate ?? "";
  const lowerLimitRate = parseFloat(lwltStr.replace(/[^0-9.]/g, "")) || 87.745;
  const bidMethod = rawJson.bidMthdNm ?? rawJson.cntrctMthdNm ?? "";
  const currentBudget = Number(ann.budget);

  const orgRange = getSajungRange(ann.orgName as string);
  const sinceDate = periodToDate(period);
  const sinceDateStr = sinceDate ? sinceDate.slice(0, 10) : null;
  const sajungFilter = { min: 85, max: 125 };

  const currentAnn = { bidMethod, budget: currentBudget };
  const categoryForFilter = categoryFilter === "all" ? null : ann.category as string;

  // ── Direct 조회 ─────────────────────────────────────────────────────────────
  const { data: directResults } = await admin
    .from("BidResult")
    .select("finalPrice, bidRate, annId")
    .eq("annId", ann.konepsId as string)
    .gt("bidRate", 0)
    .gt("finalPrice", 0)
    .limit(2000);
  const directRows = directResults ?? [];

  let result: SajungHistogramResponse | null = null;
  let autoExpanded = false;

  if (directRows.length > 0 && categoryFilter === "same" && orgScope === "exact") {
    result = await buildHistogramResponse(directRows, admin, lowerLimitRate, sajungFilter, sinceDateStr);
  }

  // exact 모드 결과가 없거나 10건 미만이면 fetchOrgKonepsIds 시도
  if (!result || result.sampleSize < 10) {
    const konepsIds = await fetchOrgKonepsIds(
      admin,
      ann.orgName as string,
      categoryForFilter,
      ann.region as string,
      currentAnn,
      orgScope,
    );
    if (konepsIds.length > 0) {
      const { data: fallback } = await admin
        .from("BidResult")
        .select("finalPrice, bidRate, annId")
        .in("annId", konepsIds)
        .gt("bidRate", 0)
        .gt("finalPrice", 0)
        .limit(2000);
      result = await buildHistogramResponse(fallback ?? [], admin, lowerLimitRate, sajungFilter, sinceDateStr);
    }
  }

  // exact 모드 결과가 여전히 10건 미만이면 자동 expand
  if (orgScope === "exact" && (!result || result.sampleSize < 10)) {
    const expandIds = await fetchOrgKonepsIds(
      admin,
      ann.orgName as string,
      categoryForFilter,
      ann.region as string,
      currentAnn,
      "expand",
    );
    if (expandIds.length > 0) {
      const { data: expandRows } = await admin
        .from("BidResult")
        .select("finalPrice, bidRate, annId")
        .in("annId", expandIds)
        .gt("bidRate", 0)
        .gt("finalPrice", 0)
        .limit(2000);
      const expandResult = await buildHistogramResponse(expandRows ?? [], admin, lowerLimitRate, sajungFilter, sinceDateStr);
      if (expandResult && expandResult.sampleSize > (result?.sampleSize ?? 0)) {
        result = expandResult;
        autoExpanded = true;
      }
    }
  }

  if (!result) return emptyResponse(lowerLimitRate);

  const finalResult: SajungHistogramResponse = {
    ...result,
    orgRange: orgRange.range,
    orgRangeMin: orgRange.min,
    orgRangeMax: orgRange.max,
    autoExpanded: autoExpanded || undefined,
  };

  // ── 캐시 저장 ──────────────────────────────────────────────────────────────
  await setCachedAnalysis(annId, period, cacheType, finalResult, finalResult.sampleSize);

  return NextResponse.json<SajungHistogramResponse>(finalResult);
}
