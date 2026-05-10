import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { calcSajung, buildBudgetAndDateMap, fetchOrgKonepsIdsWithCategoryFallback } from "@/lib/analysis/sajung-utils";
import { classifyCategory, SAJUNG_FILTER_BY_KIND } from "@/lib/analysis/category-config";

export const dynamic = "force-dynamic";

export interface OrgRecentStatsResponse {
  orgName: string;
  totalCount: number; // 최근 N개월 입찰건수 (사정율 유효 범위)
  distribution: { rate: number; count: number }[]; // 사정율 -3 ~ +3 분포 (0.5%p bucket)
  outOfRangeCount: number; // -3 ~ +3 범위 밖 건수
  avg: number | null;
}

export async function GET(req: NextRequest) {
  // 인증
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgName = req.nextUrl.searchParams.get("orgName");
  const months = Number(req.nextUrl.searchParams.get("months") ?? "3");
  const category = req.nextUrl.searchParams.get("category"); // 카테고리별 사정율 범위 분기용
  if (!orgName) return NextResponse.json({ error: "orgName required" }, { status: 400 });
  // 카테고리별 사정율 유효 범위 (인자 누락 시 보수적 50~125)
  const filterRange = SAJUNG_FILTER_BY_KIND[classifyCategory(category)];

  const admin = createAdminClient();

  // 최근 N개월 BidResult 조회 (해당 발주처)
  const sinceDate = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000);
  const sinceDateStr = sinceDate.toISOString().slice(0, 10);

  // 발주처의 konepsId 목록 (모든 카테고리·예산 무관)
  const { konepsIds } = await fetchOrgKonepsIdsWithCategoryFallback(
    admin, orgName, null, "전국", { bidMethod: "", budget: 0 }, "exact", []
  );

  if (konepsIds.length === 0) {
    return NextResponse.json<OrgRecentStatsResponse>({ orgName, totalCount: 0, distribution: [], outOfRangeCount: 0, avg: null });
  }

  const { data: bidResults } = await admin
    .from("BidResult")
    .select("annId, finalPrice, bidRate")
    .in("annId", konepsIds)
    .gt("bidRate", 0)
    .gt("finalPrice", 0)
    .limit(2000);

  const infoMap = await buildBudgetAndDateMap(admin, konepsIds);
  // 정수 키 (dev × 2) 로 저장하여 부동소수점 mismatch 차단
  const bucketMap = new Map<number, number>();
  let total = 0;
  let outOfRange = 0;
  let sum = 0;

  for (const row of bidResults ?? []) {
    const info = infoMap.get(row.annId as string);
    if (!info || !info.deadline) continue;
    if (info.deadline.slice(0, 10) < sinceDateStr) continue;
    const sajung = calcSajung(Number(row.finalPrice), Number(row.bidRate), info.budget);
    if (sajung < filterRange.min || sajung > filterRange.max) continue;
    total++;
    sum += sajung;
    const dev = sajung - 100;
    // 0.5%p bucket → 정수 키 (-6 ~ +6 = -3.0 ~ +3.0)
    const key = Math.round(dev * 2);
    if (key < -6 || key > 6) { outOfRange++; continue; }
    bucketMap.set(key, (bucketMap.get(key) ?? 0) + 1);
  }

  // 분포 (-3.0 ~ +3.0, 0.5 단위 13구간)
  const distribution: { rate: number; count: number }[] = [];
  for (let key = -6; key <= 6; key++) {
    distribution.push({ rate: key / 2, count: bucketMap.get(key) ?? 0 });
  }

  const avg = total > 0 ? Math.round((sum / total) * 1000) / 1000 : null;

  return NextResponse.json<OrgRecentStatsResponse>({
    orgName, totalCount: total, distribution, outOfRangeCount: outOfRange, avg,
  });
}
