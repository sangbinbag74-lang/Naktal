import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export interface HistogramBucket {
  rate: number;   // e.g. 101.5
  count: number;
  pct: number;    // frequency %
  cumPct: number; // cumulative %
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
}

export async function GET(req: NextRequest) {
  const annId = req.nextUrl.searchParams.get("annId");
  if (!annId) return NextResponse.json({ error: "annId required" }, { status: 400 });

  const admin = createAdminClient();

  // Fetch announcement
  const { data: ann } = await admin
    .from("Announcement")
    .select("id, konepsId, orgName, category, budget, rawJson")
    .eq("id", annId)
    .single();

  if (!ann) return NextResponse.json({ error: "Announcement not found" }, { status: 404 });

  // Extract lowerLimitRate from rawJson
  const rawJson = (ann.rawJson ?? {}) as Record<string, string>;
  const lwltStr = rawJson.sucsfbidLwltRate ?? "";
  const lowerLimitRate = parseFloat(lwltStr.replace(/[^0-9.]/g, "")) || 87.745;
  const budget = Number(ann.budget);

  // Fetch BidResult rows for this specific announcement via konepsId
  const { data: directResults } = await admin
    .from("BidResult")
    .select("finalPrice, bidRate")
    .eq("annId", ann.konepsId as string)
    .gt("bidRate", 0)
    .gt("finalPrice", 0)
    .limit(500);

  const rows = directResults ?? [];

  // If no direct results, fall back to same orgName+category
  if (rows.length === 0) {
    const { data: annIds } = await admin
      .from("Announcement")
      .select("konepsId")
      .eq("orgName", ann.orgName as string)
      .eq("category", ann.category as string)
      .limit(200);

    const konepsIds = (annIds ?? []).map((a: { konepsId: string }) => a.konepsId).filter(Boolean);

    if (konepsIds.length === 0) {
      return emptyResponse(lowerLimitRate);
    }

    const { data: fallbackResults } = await admin
      .from("BidResult")
      .select("finalPrice, bidRate")
      .in("annId", konepsIds)
      .gt("bidRate", 0)
      .gt("finalPrice", 0)
      .limit(500);

    return buildHistogramResponse(fallbackResults ?? [], budget, lowerLimitRate);
  }

  return buildHistogramResponse(rows, budget, lowerLimitRate);
}

function emptyResponse(lowerLimitRate: number): NextResponse {
  return NextResponse.json<SajungHistogramResponse>({
    histogram: [],
    sampleSize: 0,
    stats: { avg: 103.8, mode: 103.8, p25: 101, p50: 103, p75: 106, stddev: 1.5 },
    lowerLimitRate,
  });
}

function buildHistogramResponse(
  results: { finalPrice: number | string; bidRate: number | string }[],
  budget: number,
  lowerLimitRate: number,
): NextResponse {
  const rates: number[] = [];
  for (const r of results) {
    const fp = Number(r.finalPrice);
    const br = Number(r.bidRate);
    if (fp <= 0 || br <= 0 || budget <= 0) continue;
    const estimatedPrice = fp / (br / 100);
    const sajungRate = (estimatedPrice / budget) * 100;
    if (sajungRate >= 85 && sajungRate <= 125) {
      rates.push(Math.round(sajungRate * 10) / 10);
    }
  }

  if (rates.length === 0) return emptyResponse(lowerLimitRate);

  rates.sort((a, b) => a - b);

  // Build 0.1%p buckets
  const bucketMap = new Map<number, number>();
  for (const r of rates) {
    const key = Math.round(r * 10) / 10;
    bucketMap.set(key, (bucketMap.get(key) ?? 0) + 1);
  }

  const keys = Array.from(bucketMap.keys()).sort((a, b) => a - b);
  const minKey = keys[0] ?? 85;
  const maxKey = keys[keys.length - 1] ?? 125;

  const histogram: HistogramBucket[] = [];
  let cumCount = 0;
  const total = rates.length;

  let rr = minKey;
  while (rr <= maxKey + 0.001) {
    const key = Math.round(rr * 10) / 10;
    const count = bucketMap.get(key) ?? 0;
    cumCount += count;
    histogram.push({
      rate: key,
      count,
      pct: Math.round((count / total) * 1000) / 10,
      cumPct: Math.round((cumCount / total) * 1000) / 10,
    });
    rr = Math.round((rr + 0.1) * 10) / 10;
  }

  // Stats
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

  return NextResponse.json<SajungHistogramResponse>({
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
  });
}
