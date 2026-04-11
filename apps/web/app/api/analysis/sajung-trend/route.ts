import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  calcSajung,
  buildBudgetMap,
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
  fromCache?: boolean;
}

export async function GET(req: NextRequest) {
  const annId  = req.nextUrl.searchParams.get("annId");
  const userId = req.nextUrl.searchParams.get("userId");
  const period = req.nextUrl.searchParams.get("period") ?? "3y";
  if (!annId) return NextResponse.json({ error: "annId required" }, { status: 400 });

  // ── 캐시 확인 (v2: 인터페이스 변경으로 기존 캐시 무효화) ──────────────────
  const cacheUserId = userId && userId !== "anon" ? userId : "";
  const cached = await getCachedAnalysis(annId, period, "trend_v2", cacheUserId);
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

  // ── 1. 발주처 사정율 개별 건 수집 ──────────────────────────────────────────
  const konepsIds = await fetchOrgKonepsIds(
    admin,
    ann.orgName as string,
    ann.category as string,
    ann.region as string,
    currentAnn,
  );
  const orgByMonth = new Map<string, number[]>();
  const orgRaw: { date: string; sajung: number }[] = [];

  if (konepsIds.length > 0) {
    let q = admin
      .from("BidResult")
      .select("finalPrice, bidRate, annId, createdAt")
      .in("annId", konepsIds)
      .gt("bidRate", 0)
      .gt("finalPrice", 0)
      .order("createdAt", { ascending: true })
      .limit(2000);
    if (sinceDate) q = q.gte("createdAt", sinceDate);

    const { data: bidResults } = await q;
    const budgetMap = await buildBudgetMap(admin, konepsIds);

    for (const r of bidResults ?? []) {
      const sajung = calcSajung(
        Number(r.finalPrice),
        Number(r.bidRate),
        budgetMap.get(r.annId as string) ?? 0,
      );
      if (sajung < 85 || sajung > 125) continue;
      const date = (r.createdAt as string).slice(0, 7);
      const rounded = Math.round(sajung * 100) / 100;
      if (!orgByMonth.has(date)) orgByMonth.set(date, []);
      orgByMonth.get(date)!.push(rounded);
      orgRaw.push({ date, sajung: rounded });
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
  };

  // ── 캐시 저장 ──────────────────────────────────────────────────────────────
  await setCachedAnalysis(annId, period, "trend_v2", result, allOrgVals.length, cacheUserId);

  return NextResponse.json<SajungTrendResponse>(result);
}
