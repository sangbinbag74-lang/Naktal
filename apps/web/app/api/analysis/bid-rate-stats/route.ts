import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();

  // BidResult + Announcement JOIN으로 업종별 통계 계산
  const { data: bidResults, error } = await supabase
    .from("BidResult")
    .select("annId, bidRate, numBidders, finalPrice");

  const { data: announcements } = await supabase
    .from("Announcement")
    .select("konepsId, category");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const annMap = new Map<string, string>();
  for (const ann of announcements ?? []) {
    annMap.set(ann.konepsId as string, ann.category as string);
  }

  // 1. 업종별 평균 낙찰 투찰률
  const categoryMap = new Map<string, number[]>();
  for (const row of bidResults ?? []) {
    const cat = annMap.get(row.annId as string) ?? "기타";
    if (!categoryMap.has(cat)) categoryMap.set(cat, []);
    categoryMap.get(cat)!.push(parseFloat(row.bidRate as string));
  }
  const byCategory = Array.from(categoryMap.entries()).map(([category, rates]) => ({
    category,
    avgRate: parseFloat((rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(2)),
    count: rates.length,
  })).sort((a, b) => b.count - a.count);

  // 2. 투찰률 분포 히스토그램 (5% 구간)
  const distribution: Record<string, number> = {};
  for (const row of bidResults ?? []) {
    const rate = parseFloat(row.bidRate as string);
    const bucket = Math.floor(rate / 5) * 5;
    const key = `${bucket}~${bucket + 5}%`;
    distribution[key] = (distribution[key] ?? 0) + 1;
  }
  const distributionArr = Object.entries(distribution)
    .map(([range, count]) => ({ range, count }))
    .sort((a, b) => parseFloat(a.range) - parseFloat(b.range));

  // 3. 참여업체 수별 평균 투찰률
  const numBiddersMap = new Map<number, number[]>();
  for (const row of bidResults ?? []) {
    const n = row.numBidders as number;
    if (n < 1 || n > 30) continue;
    if (!numBiddersMap.has(n)) numBiddersMap.set(n, []);
    numBiddersMap.get(n)!.push(parseFloat(row.bidRate as string));
  }
  const byNumBidders = Array.from(numBiddersMap.entries())
    .map(([numBidders, rates]) => ({
      numBidders,
      avgRate: parseFloat((rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(2)),
    }))
    .sort((a, b) => a.numBidders - b.numBidders);

  return NextResponse.json({ byCategory, distribution: distributionArr, byNumBidders });
}
