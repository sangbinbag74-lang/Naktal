import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  calcSajung,
  buildBudgetAndDateMap,
  fetchOrgKonepsIds,
} from "@/lib/analysis/sajung-utils";
import { getCachedAnalysis, setCachedAnalysis, periodToDate } from "@/lib/analysis/sajung-cache";

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
}

/** 내 투찰 이력 */
export interface MyPoint {
  date: string;  // "YYYY-MM"
  sajung: number;
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
  fromCache?: boolean;
}

export async function GET(req: NextRequest) {
  const annId  = req.nextUrl.searchParams.get("annId");
  const userId = req.nextUrl.searchParams.get("userId");
  const period = req.nextUrl.searchParams.get("period") ?? "3y";
  const categoryFilter = req.nextUrl.searchParams.get("categoryFilter") ?? "same";
  const orgScope = (req.nextUrl.searchParams.get("orgScope") ?? "exact") as "exact" | "expand";
  if (!annId) return NextResponse.json({ error: "annId required" }, { status: 400 });

  // ── 캐시 확인 ──────────────────────────────────────────────────────────────
  const cacheUserId = userId && userId !== "anon" ? userId : "";
  const cacheType = `trend_v4${categoryFilter === "all" ? "_all" : ""}${orgScope === "expand" ? "_expand" : ""}`;
  const cached = await getCachedAnalysis(annId, period, cacheType, cacheUserId);
  if (cached) return NextResponse.json({ ...cached, fromCache: true });

  const admin = createAdminClient();

  const { data: ann } = await admin
    .from("Announcement")
    .select("id, konepsId, orgName, category, region, budget, rawJson")
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

  async function collectOrgPoints(scope: "exact" | "expand") {
    const ids = await fetchOrgKonepsIds(
      admin,
      annOrgName,
      categoryForFilter,
      annRegion,
      currentAnn,
      scope,
    );
    const raw: { date: string; sajung: number }[] = [];
    const byMonth = new Map<string, number[]>();
    if (ids.length > 0) {
      const { data: bidResults } = await admin
        .from("BidResult")
        .select("finalPrice, bidRate, annId")
        .in("annId", ids)
        .gt("bidRate", 0)
        .gt("finalPrice", 0)
        .limit(2000);
      const infoMap = await buildBudgetAndDateMap(admin, ids);
      const sinceDateStr = sinceDate ? sinceDate.slice(0, 10) : null;
      for (const r of bidResults ?? []) {
        const info = infoMap.get(r.annId as string);
        if (!info || !info.deadline) continue;
        if (sinceDateStr && info.deadline.slice(0, 10) < sinceDateStr) continue;
        const sajung = calcSajung(Number(r.finalPrice), Number(r.bidRate), info.budget);
        if (sajung < 85 || sajung > 125) continue;
        const date = info.deadline.slice(0, 7);
        const rounded = Math.round(sajung * 100) / 100;
        if (!byMonth.has(date)) byMonth.set(date, []);
        byMonth.get(date)!.push(rounded);
        raw.push({ date, sajung: rounded });
      }
    }
    return { raw, byMonth };
  }

  let { raw: orgRaw, byMonth: orgByMonth } = await collectOrgPoints(orgScope);
  let autoExpanded = false;

  // exact 모드에서 10건 미만이면 자동 expand
  if (orgScope === "exact" && orgRaw.length < 10) {
    const expanded = await collectOrgPoints("expand");
    if (expanded.raw.length > orgRaw.length) {
      orgRaw = expanded.raw;
      orgByMonth = expanded.byMonth;
      autoExpanded = true;
    }
  }

  // 날짜순 정렬 후 seq 부여
  const orgPoints: OrgPoint[] = orgRaw
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p, i) => ({ seq: i + 1, date: p.date, sajung: p.sajung }));

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
    for (const o of outcomes ?? []) {
      const sajung = Number(o.actualSajungRate);
      if (!sajung || sajung < 85 || sajung > 125) continue;
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

  const result: SajungTrendResponse = {
    orgPoints,
    myPoints,
    orgCount: allOrgVals.length,
    mineCount: allMineVals.length,
    orgAvg,
    mineAvg,
    gap,
    autoExpanded: autoExpanded || undefined,
  };

  // ── 캐시 저장 ──────────────────────────────────────────────────────────────
  await setCachedAnalysis(annId, period, cacheType, result, allOrgVals.length, cacheUserId);

  return NextResponse.json<SajungTrendResponse>(result);
}
