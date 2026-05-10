import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  calcSajung,
  buildBudgetAndDateMap,
  fetchOrgKonepsIdsWithCategoryFallback,
} from "@/lib/analysis/sajung-utils";
import { getCachedAnalysis, setCachedAnalysis, periodToDate } from "@/lib/analysis/sajung-cache";
import { classifyCategory, SAJUNG_FILTER_BY_KIND } from "@/lib/analysis/category-config";

export interface TrendPoint {
  date: string;
  orgSajung: number | null;
  mineSajung: number | null;
}

/** 발주처 개별 낙찰 건 (순번 + 날짜 + 사정율) */
export interface OrgPoint {
  seq: number;   // 1-based ordinal (날짜순 정렬)
  date: string;  // "YYYY-MM"
  sajung: number;
  numBidders?: number; // 참여자/사정율 상관 (F 카드)
}

/** 내 투찰 이력 */
export interface MyPoint {
  date: string;  // "YYYY-MM"
  sajung: number;
}

export interface PredictionItem {
  deviation: number;
  sajung: number;
  label: string;
}

export interface SajungPredictions {
  center: PredictionItem;
  upper: PredictionItem;
  lower: PredictionItem;
  basis: string;
}

export interface SajungTrendResponse {
  trend?: TrendPoint[];
  orgPoints: OrgPoint[];
  myPoints: MyPoint[];
  orgCount: number;
  mineCount: number;
  orgAvg: number | null;
  mineAvg: number | null;
  gap: number | null;
  autoExpanded?: boolean;
  expandedCategory?: boolean;
  usedCategories?: string[];
  fromCache?: boolean;
  predictions?: SajungPredictions;
}

// ── 예측 헬퍼 ──────────────────────────────────────────────────────────────

function calcTrendSlope(points: { sajung: number; date: string }[]): { slope: number; direction: string } {
  if (points.length < 3) return { slope: 0, direction: "stable" };
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const n = sorted.length;
  const xs = sorted.map((_, i) => i);
  const ys = sorted.map(p => p.sajung);
  const xMean = xs.reduce((s, x) => s + x, 0) / n;
  const yMean = ys.reduce((s, y) => s + y, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - xMean) * ((ys[i] ?? yMean) - yMean), 0);
  const den = xs.reduce((s, x) => s + (x - xMean) ** 2, 0);
  const slope = den === 0 ? 0 : Math.round((num / den) * 10000) / 10000;
  const direction = slope > 0.01 ? "up" : slope < -0.01 ? "down" : "stable";
  return { slope, direction };
}

function calcStability(points: { sajung: number }[], avg: number): number {
  if (points.length < 2) return 0.5;
  const variance = points.reduce((s, p) => s + (p.sajung - avg) ** 2, 0) / points.length;
  const stddev = Math.sqrt(variance);
  return Math.max(0, Math.min(1, 1 - stddev / 5));
}

// annId 기반 deterministic seed (공고마다 다른 노이즈 + 같은 공고는 항상 같은 결과)
function hashSeed(annId: string): number {
  let hash = 0;
  for (let i = 0; i < annId.length; i++) {
    hash = ((hash << 5) - hash + annId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12345.6789) * 10000;
  return x - Math.floor(x); // 0~1
}

function calcNext3Predictions(
  orgPoints: { sajung: number; date: string }[],
  orgAvg: number,
  trendResult: { slope: number; direction: string },
  stabilityScore: number,
  annId: string,
): SajungPredictions {
  // annId 기반 deterministic 노이즈 (공고마다 다른 결과 + 같은 공고는 재현)
  const seed = hashSeed(annId);
  const noiseCenter = (seededRandom(seed) - 0.5);       // -0.5 ~ +0.5
  const noiseUpper  = (seededRandom(seed + 1) - 0.5);
  const noiseLower  = (seededRandom(seed + 2) - 0.5);

  if (orgPoints.length < 3) {
    // 폴백 — 노이즈 ±0.15%p
    const c = Math.round(noiseCenter * 0.3 * 1000) / 1000;
    const u = Math.round((0.5 + noiseUpper * 0.3) * 1000) / 1000;
    const l = Math.round((-0.5 + noiseLower * 0.3) * 1000) / 1000;
    return {
      center: { deviation: c,  sajung: Math.round((orgAvg + c) * 1000) / 1000, label: "가장 유력" },
      upper:  { deviation: u,  sajung: Math.round((orgAvg + u) * 1000) / 1000, label: "상단 예상" },
      lower:  { deviation: l,  sajung: Math.round((orgAvg + l) * 1000) / 1000, label: "하단 예상" },
      basis: "데이터 부족 — 발주처 평균 기준",
    };
  }
  const recent = [...orgPoints].sort((a, b) => a.date.localeCompare(b.date)).slice(-10);
  const deviations = recent.map(p => p.sajung - orgAvg);
  const meanDev = deviations.reduce((s, d) => s + d, 0) / deviations.length;
  const stddev = Math.sqrt(deviations.reduce((s, d) => s + (d - meanDev) ** 2, 0) / deviations.length);
  // 노이즈 = stddev × ±0.3 (정규분포 안 ±0.3σ 범위)
  const noise = stddev * 0.3;
  const centerDev = Math.round((meanDev + trendResult.slope + (noiseCenter * noise)) * 1000) / 1000;
  const spread = stddev * (1 + (1 - stabilityScore) * 0.5);
  const upperDev = Math.round((centerDev + spread * 0.67 + (noiseUpper * noise * 0.5)) * 1000) / 1000;
  const lowerDev = Math.round((centerDev - spread * 0.67 + (noiseLower * noise * 0.5)) * 1000) / 1000;
  return {
    center: { deviation: centerDev, sajung: Math.round((orgAvg + centerDev) * 1000) / 1000, label: "가장 유력" },
    upper:  { deviation: upperDev,  sajung: Math.round((orgAvg + upperDev) * 1000) / 1000,  label: "상단 예상" },
    lower:  { deviation: lowerDev,  sajung: Math.round((orgAvg + lowerDev) * 1000) / 1000,  label: "하단 예상" },
    basis: `최근 ${recent.length}건 · ${trendResult.direction !== "stable" ? (trendResult.direction === "up" ? "상승" : "하락") + "추세" : "추세 안정"} · ±${stddev.toFixed(3)}%p`,
  };
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const annId  = req.nextUrl.searchParams.get("annId");
  const userId = req.nextUrl.searchParams.get("userId");
  const period = req.nextUrl.searchParams.get("period") ?? "3y";
  const categoryFilter = req.nextUrl.searchParams.get("categoryFilter") ?? "same";
  const orgScope = (req.nextUrl.searchParams.get("orgScope") ?? "exact") as "exact" | "expand";
  if (!annId) return NextResponse.json({ error: "annId required" }, { status: 400 });

  // ── 캐시 확인 ──────────────────────────────────────────────────────────────
  const cacheUserId = userId && userId !== "anon" ? userId : "";
  const cacheType = `trend_v5${categoryFilter === "all" ? "_all" : ""}${orgScope === "expand" ? "_expand" : ""}`;
  const cached = await getCachedAnalysis(annId, period, cacheType, cacheUserId);
  if (cached) return NextResponse.json({ ...cached, fromCache: true });

  const admin = createAdminClient();

  const { data: ann } = await admin
    .from("Announcement")
    .select("id, konepsId, orgName, category, region, budget, rawJson, subCategories")
    .eq("id", annId)
    .single();

  if (!ann) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rawJson = (ann.rawJson ?? {}) as Record<string, string>;
  const bidMethod = rawJson.bidMthdNm ?? rawJson.cntrctMthdNm ?? "";
  const currentAnn = { bidMethod, budget: Number(ann.budget) };
  const sinceDate = periodToDate(period);
  const categoryForFilter = categoryFilter === "all" ? null : ann.category as string;

  // ── 1. 발주처 사정율 개별 건 수집 ──────────────────────────────────────────
  const annOrgName = ann.orgName as string;
  const annRegion = ann.region as string;
  const sinceDateStr = sinceDate ? sinceDate.slice(0, 10) : null;

  const annSubCats = (ann.subCategories as string[] | null) ?? [];
  const { konepsIds, expandedCategory, usedCategories } =
    await fetchOrgKonepsIdsWithCategoryFallback(
      admin, annOrgName, categoryForFilter, annRegion, currentAnn, orgScope, annSubCats,
    );

  const orgRaw: { date: string; sajung: number; numBidders?: number }[] = [];
  const orgByMonth = new Map<string, number[]>();

  if (konepsIds.length > 0) {
    const { data: bidResults } = await admin
      .from("BidResult")
      .select("finalPrice, bidRate, annId, numBidders")
      .in("annId", konepsIds)
      .gt("bidRate", 0)
      .gt("finalPrice", 0)
      .limit(2000);
    const infoMap = await buildBudgetAndDateMap(admin, konepsIds);
    // 카테고리별 사정율 유효 범위 (공사 85~125 / 용역 50~110 / 물품 30~110)
    const filterRange = SAJUNG_FILTER_BY_KIND[classifyCategory(ann.category as string)];
    for (const r of bidResults ?? []) {
      const info = infoMap.get(r.annId as string);
      if (!info || !info.deadline) continue;
      if (sinceDateStr && info.deadline.slice(0, 10) < sinceDateStr) continue;
      const sajung = calcSajung(Number(r.finalPrice), Number(r.bidRate), info.budget);
      if (sajung < filterRange.min || sajung > filterRange.max) continue;
      const date = info.deadline.slice(0, 7);
      const rounded = Math.round(sajung * 100) / 100;
      if (!orgByMonth.has(date)) orgByMonth.set(date, []);
      orgByMonth.get(date)!.push(rounded);
      orgRaw.push({ date, sajung: rounded, numBidders: r.numBidders ? Number(r.numBidders) : undefined });
    }
  }

  // 날짜순 정렬 후 seq 부여
  const orgPoints: OrgPoint[] = orgRaw
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p, i) => ({ seq: i + 1, date: p.date, sajung: p.sajung, numBidders: p.numBidders }));

  // ── 2. 내 투찰 이력 수집 ────────────────────────────────────────────────────
  const mineByMonth = new Map<string, number[]>();
  const myPoints: MyPoint[] = [];

  if (userId && userId !== "anon") {
    let q = admin
      .from("BidOutcome")
      .select("actualSajungRate, bidAt")
      .eq("userId", userId)
      .not("actualSajungRate", "is", null)
      .order("bidAt", { ascending: true })
      .limit(200);
    if (sinceDate) q = q.gte("bidAt", sinceDate);

    const { data: outcomes } = await q;
    // 내 투찰 이력도 동일한 카테고리 범위로 필터
    const mineFilterRange = SAJUNG_FILTER_BY_KIND[classifyCategory(ann.category as string)];
    for (const o of outcomes ?? []) {
      const sajung = Number(o.actualSajungRate);
      if (!sajung || sajung < mineFilterRange.min || sajung > mineFilterRange.max) continue;
      const date = (o.bidAt as string).slice(0, 7);
      const rounded = Math.round(sajung * 100) / 100;
      if (!mineByMonth.has(date)) mineByMonth.set(date, []);
      mineByMonth.get(date)!.push(rounded);
      myPoints.push({ date, sajung: rounded });
    }
  }

  // ── 3. 통계 ─────────────────────────────────────────────────────────────────
  const allOrgVals = [...orgByMonth.values()].flat();
  const allMineVals = [...mineByMonth.values()].flat();
  const orgAvg = allOrgVals.length
    ? Math.round((allOrgVals.reduce((s, v) => s + v, 0) / allOrgVals.length) * 100) / 100
    : null;
  const mineAvg = allMineVals.length
    ? Math.round((allMineVals.reduce((s, v) => s + v, 0) / allMineVals.length) * 100) / 100
    : null;
  const gap = orgAvg !== null && mineAvg !== null
    ? Math.round((mineAvg - orgAvg) * 100) / 100
    : null;

  // ── 4. 예측 사정율 3개 ──────────────────────────────────────────────────
  let predictions: SajungPredictions | undefined;
  if (orgAvg !== null && orgPoints.length >= 3) {
    const trendResult = calcTrendSlope(orgPoints);
    const stabilityScore = calcStability(orgPoints, orgAvg);
    predictions = calcNext3Predictions(orgPoints, orgAvg, trendResult, stabilityScore, annId);
  }

  const result: SajungTrendResponse = {
    orgPoints,
    myPoints,
    orgCount: allOrgVals.length,
    mineCount: allMineVals.length,
    orgAvg,
    mineAvg,
    gap,
    expandedCategory: expandedCategory || undefined,
    usedCategories: usedCategories.length > 0 ? usedCategories : undefined,
    predictions,
  };

  // ── 캐시 저장 ──────────────────────────────────────────────────────────────
  await setCachedAnalysis(annId, period, cacheType, result, allOrgVals.length, cacheUserId);

  return NextResponse.json<SajungTrendResponse>(result);
}
