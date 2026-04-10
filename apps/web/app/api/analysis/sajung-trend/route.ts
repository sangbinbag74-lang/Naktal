import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { calcSajung, buildBudgetMap, fetchOrgKonepsIds } from "@/lib/analysis/sajung-utils";

export interface TrendPoint {
  date: string;       // "YYYY-MM"
  orgSajung: number | null;
  mineSajung: number | null;
}

export interface SajungTrendResponse {
  trend: TrendPoint[];
  orgCount: number;
  mineCount: number;
  orgAvg: number | null;
  mineAvg: number | null;
  gap: number | null; // mineAvg - orgAvg (양수 = 내가 더 높게 투찰)
}

export async function GET(req: NextRequest) {
  const annId  = req.nextUrl.searchParams.get("annId");
  const userId = req.nextUrl.searchParams.get("userId");
  if (!annId) return NextResponse.json({ error: "annId required" }, { status: 400 });

  const admin = createAdminClient();

  const { data: ann } = await admin
    .from("Announcement")
    .select("id, konepsId, orgName, category")
    .eq("id", annId)
    .single();

  if (!ann) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // ── 1. 발주처 사정율 시계열 ──────────────────────────────────────────────
  const konepsIds = await fetchOrgKonepsIds(
    admin,
    ann.orgName as string,
    ann.category as string,
    300,
  );

  const orgByMonth = new Map<string, number[]>(); // "YYYY-MM" → sazung[]

  if (konepsIds.length > 0) {
    const { data: bidResults } = await admin
      .from("BidResult")
      .select("finalPrice, bidRate, annId, createdAt")
      .in("annId", konepsIds)
      .gt("bidRate", 0)
      .gt("finalPrice", 0)
      .order("createdAt", { ascending: true })
      .limit(500);

    const budgetMap = await buildBudgetMap(admin, konepsIds);

    for (const r of bidResults ?? []) {
      const sajung = calcSajung(
        Number(r.finalPrice),
        Number(r.bidRate),
        budgetMap.get(r.annId as string) ?? 0,
      );
      if (sajung < 85 || sajung > 125) continue;
      const date = (r.createdAt as string).slice(0, 7); // "YYYY-MM"
      if (!orgByMonth.has(date)) orgByMonth.set(date, []);
      orgByMonth.get(date)!.push(Math.round(sajung * 100) / 100);
    }
  }

  // ── 2. 내 투찰 이력 사정율 시계열 (userId 있는 경우) ───────────────────
  const mineByMonth = new Map<string, number[]>();

  if (userId && userId !== "anon") {
    const { data: outcomes } = await admin
      .from("BidOutcome")
      .select("actualSajungRate, bidAt")
      .eq("userId", userId)
      .not("actualSajungRate", "is", null)
      .order("bidAt", { ascending: true })
      .limit(200);

    for (const o of outcomes ?? []) {
      const sajung = Number(o.actualSajungRate);
      if (!sajung || sajung < 85 || sajung > 125) continue;
      const date = (o.bidAt as string).slice(0, 7);
      if (!mineByMonth.has(date)) mineByMonth.set(date, []);
      mineByMonth.get(date)!.push(Math.round(sajung * 100) / 100);
    }
  }

  // ── 3. 날짜 기준 머지 ───────────────────────────────────────────────────
  const allDates = [...new Set([...orgByMonth.keys(), ...mineByMonth.keys()])].sort();

  const trend: TrendPoint[] = allDates.map((date) => {
    const orgArr = orgByMonth.get(date) ?? [];
    const mineArr = mineByMonth.get(date) ?? [];
    const orgSajung = orgArr.length
      ? Math.round((orgArr.reduce((s, v) => s + v, 0) / orgArr.length) * 100) / 100
      : null;
    const mineSajung = mineArr.length
      ? Math.round((mineArr.reduce((s, v) => s + v, 0) / mineArr.length) * 100) / 100
      : null;
    return { date, orgSajung, mineSajung };
  });

  // ── 4. 요약 통계 ─────────────────────────────────────────────────────────
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

  return NextResponse.json<SajungTrendResponse>({
    trend,
    orgCount: allOrgVals.length,
    mineCount: allMineVals.length,
    orgAvg,
    mineAvg,
    gap,
  });
}
