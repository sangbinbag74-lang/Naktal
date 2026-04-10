import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  calcSajung,
  buildBudgetMap,
  fetchOrgKonepsIds,
  roundBucket,
} from "@/lib/analysis/sajung-utils";

export interface TopTenItem {
  rank: number;
  bucket: number;       // e.g. 109.5
  winCount: number;
  winRate: number;      // winCount / total (%)
  attractiveness: number; // 0~100 relative score
  bidPrice: number;     // budget × (bucket/100) × (lowerLimitRate/100)
}

export interface SajungTopTenResponse {
  topTen: TopTenItem[];
  sampleSize: number;
  lowerLimitRate: number;
}

export async function GET(req: NextRequest) {
  const annId = req.nextUrl.searchParams.get("annId");
  if (!annId) return NextResponse.json({ error: "annId required" }, { status: 400 });

  const admin = createAdminClient();

  const { data: ann } = await admin
    .from("Announcement")
    .select("id, konepsId, orgName, category, budget, rawJson")
    .eq("id", annId)
    .single();

  if (!ann) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rawJson = (ann.rawJson ?? {}) as Record<string, string>;
  const lwltStr = rawJson.sucsfbidLwltRate ?? "";
  const lowerLimitRate = parseFloat(lwltStr.replace(/[^0-9.]/g, "")) || 87.745;
  const currentBudget = Number(ann.budget);

  // ── 낙찰 결과 수집 (direct → fallback) ─────────────────────────────────
  let bidRows: { finalPrice: string | number; bidRate: string | number; annId: string }[] = [];

  const { data: direct } = await admin
    .from("BidResult")
    .select("finalPrice, bidRate, annId")
    .eq("annId", ann.konepsId as string)
    .gt("bidRate", 0)
    .gt("finalPrice", 0)
    .limit(500);

  if ((direct ?? []).length > 0) {
    bidRows = direct!;
  } else {
    const konepsIds = await fetchOrgKonepsIds(
      admin,
      ann.orgName as string,
      ann.category as string,
    );
    if (konepsIds.length > 0) {
      const { data: fallback } = await admin
        .from("BidResult")
        .select("finalPrice, bidRate, annId")
        .in("annId", konepsIds)
        .gt("bidRate", 0)
        .gt("finalPrice", 0)
        .limit(500);
      bidRows = fallback ?? [];
    }
  }

  if (bidRows.length === 0) {
    return NextResponse.json<SajungTopTenResponse>({
      topTen: [],
      sampleSize: 0,
      lowerLimitRate,
    });
  }

  // ── 각 공고 자체 budget으로 사정율 계산 ──────────────────────────────────
  const uniqueIds = [...new Set(bidRows.map((r) => r.annId))];
  const budgetMap = await buildBudgetMap(admin, uniqueIds);

  const bucketMap = new Map<number, number>(); // bucket → count
  let total = 0;

  for (const r of bidRows) {
    const sajung = calcSajung(
      Number(r.finalPrice),
      Number(r.bidRate),
      budgetMap.get(r.annId) ?? 0,
    );
    if (sajung < 85 || sajung > 125) continue;
    const bucket = roundBucket(sajung);
    bucketMap.set(bucket, (bucketMap.get(bucket) ?? 0) + 1);
    total++;
  }

  if (total === 0) {
    return NextResponse.json<SajungTopTenResponse>({
      topTen: [],
      sampleSize: 0,
      lowerLimitRate,
    });
  }

  // ── 매력도 계산 후 TOP 10 ──────────────────────────────────────────────
  const sorted = [...bucketMap.entries()]
    .sort((a, b) => b[1] - a[1]) // 낙찰 빈도 내림차순
    .slice(0, 10);

  const maxCount = sorted[0]?.[1] ?? 1;

  const topTen: TopTenItem[] = sorted.map(([bucket, count], i) => ({
    rank: i + 1,
    bucket,
    winCount: count,
    winRate: Math.round((count / total) * 1000) / 10,
    attractiveness: Math.round((count / maxCount) * 100),
    bidPrice: Math.round(currentBudget * (bucket / 100) * (lowerLimitRate / 100)),
  }));

  return NextResponse.json<SajungTopTenResponse>({ topTen, sampleSize: total, lowerLimitRate });
}
