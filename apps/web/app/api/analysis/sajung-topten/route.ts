import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  calcSajung,
  buildBudgetAndDateMap,
  fetchOrgKonepsIds,
  roundBucket,
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
  orgAvg: number | null;
  autoExpanded?: boolean;
  fromCache?: boolean;
}

export async function GET(req: NextRequest) {
  const annId = req.nextUrl.searchParams.get("annId");
  const period = req.nextUrl.searchParams.get("period") ?? "3y";
  const categoryFilter = req.nextUrl.searchParams.get("categoryFilter") ?? "same";
  const orgScope = (req.nextUrl.searchParams.get("orgScope") ?? "exact") as "exact" | "expand";
  if (!annId) return NextResponse.json({ error: "annId required" }, { status: 400 });

  // ── 캐시 확인 ──────────────────────────────────────────────────────────────
  const cacheType = `topten_v3${categoryFilter === "all" ? "_all" : ""}${orgScope === "expand" ? "_expand" : ""}`;
  const cached = await getCachedAnalysis(annId, period, cacheType);
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

  const sinceDate = periodToDate(period);
  const sinceDateStr = sinceDate ? sinceDate.slice(0, 10) : null;
  const currentAnn = { bidMethod, budget: currentBudget };
  const categoryForFilter = categoryFilter === "all" ? null : ann.category as string;

  // ── 낙찰 결과 수집 (direct → fallback → auto-expand) ────────────────────────
  let bidRows: { finalPrice: string | number; bidRate: string | number; annId: string }[] = [];
  let autoExpanded = false;

  const { data: direct } = await admin
    .from("BidResult")
    .select("finalPrice, bidRate, annId")
    .eq("annId", ann.konepsId as string)
    .gt("bidRate", 0)
    .gt("finalPrice", 0)
    .limit(2000);

  if ((direct ?? []).length > 0 && categoryFilter === "same" && orgScope === "exact") {
    bidRows = direct!;
  }

  if (bidRows.length < 10) {
    let konepsIds = await fetchOrgKonepsIds(
      admin,
      ann.orgName as string,
      categoryForFilter,
      ann.region as string,
      currentAnn,
      orgScope,
    );

    // exact 모드에서 sample < 10이면 자동 expand (category 유지)
    if (orgScope === "exact" && konepsIds.length > 0) {
      const { data: sample } = await admin
        .from("BidResult")
        .select("id")
        .in("annId", konepsIds.slice(0, 100))
        .gt("bidRate", 0)
        .gt("finalPrice", 0)
        .limit(15);
      if ((sample?.length ?? 0) < 10) {
        const expandedIds = await fetchOrgKonepsIds(
          admin,
          ann.orgName as string,
          ann.category as string,
          ann.region as string,
          currentAnn,
          "expand",
        );
        if (expandedIds.length > konepsIds.length) {
          konepsIds = expandedIds;
          autoExpanded = true;
        }
      }
    }

    if (konepsIds.length > 0) {
      const { data: fallback } = await admin
        .from("BidResult")
        .select("finalPrice, bidRate, annId")
        .in("annId", konepsIds)
        .gt("bidRate", 0)
        .gt("finalPrice", 0)
        .limit(2000);
      if ((fallback ?? []).length > bidRows.length) bidRows = fallback ?? [];
    }
  }

  const emptyResp: SajungTopTenResponse = { topTen: [], sampleSize: 0, lowerLimitRate, orgAvg: null };
  if (bidRows.length === 0) return NextResponse.json<SajungTopTenResponse>(emptyResp);

  // ── 사정율 계산 ─────────────────────────────────────────────────────────────
  const uniqueIds = [...new Set(bidRows.map((r) => r.annId))];
  const infoMap = await buildBudgetAndDateMap(admin, uniqueIds);

  const bucketMap = new Map<number, number>();
  let total = 0;

  for (const r of bidRows) {
    const info = infoMap.get(r.annId);
    if (!info || !info.deadline) continue;
    if (sinceDateStr && info.deadline.slice(0, 10) < sinceDateStr) continue;
    const sajung = calcSajung(Number(r.finalPrice), Number(r.bidRate), info.budget);
    if (sajung < 85 || sajung > 125) continue;
    const bucket = roundBucket(sajung);
    bucketMap.set(bucket, (bucketMap.get(bucket) ?? 0) + 1);
    total++;
  }

  if (total === 0) return NextResponse.json<SajungTopTenResponse>(emptyResp);

  const sorted = [...bucketMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxCount = sorted[0]?.[1] ?? 1;

  // 발주처 평균 사정율 (편차 기준값)
  const allBuckets = [...bucketMap.entries()].flatMap(([bucket, count]) => Array(count).fill(bucket));
  const orgAvg = allBuckets.length > 0
    ? Math.round((allBuckets.reduce((s: number, v: number) => s + v, 0) / allBuckets.length) * 1000) / 1000
    : null;

  const topTen: TopTenItem[] = sorted.map(([bucket, count], i) => ({
    rank: i + 1,
    bucket,
    winCount: count,
    winRate: Math.round((count / total) * 1000) / 10,
    attractiveness: Math.round((count / maxCount) * 100),
    bidPrice: Math.round(currentBudget * (bucket / 100) * (lowerLimitRate / 100)),
  }));

  const result: SajungTopTenResponse = { topTen, sampleSize: total, lowerLimitRate, orgAvg, autoExpanded: autoExpanded || undefined };

  // ── 캐시 저장 ──────────────────────────────────────────────────────────────
  await setCachedAnalysis(annId, period, cacheType, result, total);

  return NextResponse.json<SajungTopTenResponse>(result);
}
