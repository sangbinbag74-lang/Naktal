import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  calcSajung,
  buildBudgetMap,
  fetchOrgKonepsIds,
  roundBucket,
  getSajungFilter,
} from "@/lib/analysis/sajung-utils";
import { getCachedAnalysis, setCachedAnalysis, periodToDate } from "@/lib/analysis/sajung-cache";

export interface TopTenItem {
  rank: number;
  bucket: number;
  winCount: number;
  winRate: number;
  attractiveness: number;
  bidPrice: number;
}

export interface SajungTopTenResponse {
  topTen: TopTenItem[];
  sampleSize: number;
  lowerLimitRate: number;
  fromCache?: boolean;
}

export async function GET(req: NextRequest) {
  const annId = req.nextUrl.searchParams.get("annId");
  const period = req.nextUrl.searchParams.get("period") ?? "3y";
  if (!annId) return NextResponse.json({ error: "annId required" }, { status: 400 });

  // ── 캐시 확인 ──────────────────────────────────────────────────────────────
  const cached = await getCachedAnalysis(annId, period, "topten");
  if (cached) return NextResponse.json({ ...cached, fromCache: true });

  const admin = createAdminClient();

  const { data: ann } = await admin
    .from("Announcement")
    .select("id, konepsId, orgName, category, region, budget, rawJson")
    .eq("id", annId)
    .single();

  if (!ann) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rawJson = (ann.rawJson ?? {}) as Record<string, string>;
  const lwltStr = rawJson.sucsfbidLwltRate ?? "";
  const lowerLimitRate = parseFloat(lwltStr.replace(/[^0-9.]/g, "")) || 87.745;
  const currentBudget = Number(ann.budget);
  const bidMethod = rawJson.bidMthdNm ?? rawJson.cntrctMthdNm ?? "";

  const sajungFilter = getSajungFilter(ann.orgName as string);
  const sinceDate = periodToDate(period);
  const currentAnn = { bidMethod, budget: currentBudget };

  // ── 낙찰 결과 수집 (direct → fallback) ──────────────────────────────────────
  let bidRows: { finalPrice: string | number; bidRate: string | number; annId: string }[] = [];

  let directQ = admin
    .from("BidResult")
    .select("finalPrice, bidRate, annId")
    .eq("annId", ann.konepsId as string)
    .gt("bidRate", 0)
    .gt("finalPrice", 0)
    .limit(2000);
  if (sinceDate) directQ = directQ.gte("createdAt", sinceDate);
  const { data: direct } = await directQ;

  if ((direct ?? []).length > 0) {
    bidRows = direct!;
  } else {
    const konepsIds = await fetchOrgKonepsIds(
      admin,
      ann.orgName as string,
      ann.category as string,
      ann.region as string,
      currentAnn,
    );
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
      bidRows = fallback ?? [];
    }
  }

  const emptyResp: SajungTopTenResponse = { topTen: [], sampleSize: 0, lowerLimitRate };
  if (bidRows.length === 0) return NextResponse.json<SajungTopTenResponse>(emptyResp);

  // ── 사정율 계산 ─────────────────────────────────────────────────────────────
  const uniqueIds = [...new Set(bidRows.map((r) => r.annId))];
  const budgetMap = await buildBudgetMap(admin, uniqueIds);

  const bucketMap = new Map<number, number>();
  let total = 0;

  for (const r of bidRows) {
    const sajung = calcSajung(Number(r.finalPrice), Number(r.bidRate), budgetMap.get(r.annId) ?? 0);
    if (sajung < sajungFilter.min || sajung > sajungFilter.max) continue;
    const bucket = roundBucket(sajung);
    bucketMap.set(bucket, (bucketMap.get(bucket) ?? 0) + 1);
    total++;
  }

  if (total === 0) return NextResponse.json<SajungTopTenResponse>(emptyResp);

  const sorted = [...bucketMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxCount = sorted[0]?.[1] ?? 1;

  const topTen: TopTenItem[] = sorted.map(([bucket, count], i) => ({
    rank: i + 1,
    bucket,
    winCount: count,
    winRate: Math.round((count / total) * 1000) / 10,
    attractiveness: Math.round((count / maxCount) * 100),
    bidPrice: Math.round(currentBudget * (bucket / 100) * (lowerLimitRate / 100)),
  }));

  const result: SajungTopTenResponse = { topTen, sampleSize: total, lowerLimitRate };

  // ── 캐시 저장 ──────────────────────────────────────────────────────────────
  await setCachedAnalysis(annId, period, "topten", result, total);

  return NextResponse.json<SajungTopTenResponse>(result);
}
