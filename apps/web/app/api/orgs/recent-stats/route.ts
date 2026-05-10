import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { calcSajung, buildBudgetAndDateMap, fetchOrgKonepsIdsWithCategoryFallback, roundBucket } from "@/lib/analysis/sajung-utils";

export const dynamic = "force-dynamic";

export interface OrgRecentStatsResponse {
  orgName: string;
  totalCount: number; // 최근 N개월 입찰건수
  distribution: { rate: number; count: number }[]; // 사정율 -3 ~ +3 분포
  avg: number | null;
}

export async function GET(req: NextRequest) {
  // 인증
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgName = req.nextUrl.searchParams.get("orgName");
  const months = Number(req.nextUrl.searchParams.get("months") ?? "3");
  if (!orgName) return NextResponse.json({ error: "orgName required" }, { status: 400 });

  const admin = createAdminClient();

  // 최근 N개월 BidResult 조회 (해당 발주처)
  const sinceDate = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000);
  const sinceDateStr = sinceDate.toISOString().slice(0, 10);

  // 발주처의 konepsId 목록 (모든 카테고리·예산 무관)
  const { konepsIds } = await fetchOrgKonepsIdsWithCategoryFallback(
    admin, orgName, null, "전국", { bidMethod: "", budget: 0 }, "exact", []
  );

  if (konepsIds.length === 0) {
    return NextResponse.json<OrgRecentStatsResponse>({ orgName, totalCount: 0, distribution: [], avg: null });
  }

  const { data: bidResults } = await admin
    .from("BidResult")
    .select("annId, finalPrice, bidRate")
    .in("annId", konepsIds)
    .gt("bidRate", 0)
    .gt("finalPrice", 0)
    .limit(2000);

  const infoMap = await buildBudgetAndDateMap(admin, konepsIds);
  const bucketMap = new Map<number, number>();
  let total = 0;
  let sum = 0;

  for (const r of bidResults ?? []) {
    const info = infoMap.get(r.annId as string);
    if (!info || !info.deadline) continue;
    if (info.deadline.slice(0, 10) < sinceDateStr) continue;
    const sajung = calcSajung(Number(r.finalPrice), Number(r.bidRate), info.budget);
    if (sajung < 85 || sajung > 125) continue;
    // 사정율 → -3 ~ +3 편차 0.5%p bucket
    const dev = sajung - 100;
    const bucket = roundBucket(dev * 2) / 2; // 0.5 단위 bucket
    bucketMap.set(bucket, (bucketMap.get(bucket) ?? 0) + 1);
    total++;
    sum += sajung;
  }

  // 분포 정렬 (-3 ~ +3)
  const distribution: { rate: number; count: number }[] = [];
  for (let dev = -3; dev <= 3; dev += 0.5) {
    const r = Math.round(dev * 10) / 10;
    distribution.push({ rate: r, count: bucketMap.get(r) ?? 0 });
  }

  const avg = total > 0 ? Math.round((sum / total) * 1000) / 1000 : null;

  return NextResponse.json<OrgRecentStatsResponse>({
    orgName, totalCount: total, distribution, avg,
  });
}
