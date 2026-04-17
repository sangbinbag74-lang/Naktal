import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  g2bFetchBidResultPage,
  g2bFetchAnnouncementPage,
  g2bExtractRegion,
  g2bParseDate,
  toYMD,
  daysAgo,
  type G2BBidResult,
  type G2BAnnouncement,
} from "@/lib/g2b";

const NUM_OF_ROWS = 100;

async function syncBidResultsFromG2B(
  supabase: Awaited<ReturnType<typeof createClient>>,
  days: number,
): Promise<number> {
  const today   = toYMD(new Date());
  const fromDay = toYMD(daysAgo(days));
  let page = 1, saved = 0;

  while (true) {
    const { items, totalCount } = await g2bFetchBidResultPage({
      pageNo: page, numOfRows: NUM_OF_ROWS,
      inqryBgnDt: `${fromDay}0000`,
      inqryEndDt: `${today}2359`,
    });
    if (items.length === 0) break;

    const rows = items.map((item: G2BBidResult) => {
      const annId    = item.bidNtceNo?.trim();
      const rateRaw  = (item.sucsfbidRate || "").replace(/[^0-9.]/g, "");
      const priceRaw = (item.sucsfbidAmt  || "").replace(/[^0-9]/g, "");
      if (!annId || !rateRaw || !priceRaw) return null;
      return {
        annId,
        bidRate: parseFloat(rateRaw).toFixed(3),
        finalPrice: String(parseInt(priceRaw, 10)),
        numBidders: parseInt((item.totPrtcptCo || "0").replace(/[^0-9]/g, ""), 10),
      };
    }).filter(Boolean);

    if (rows.length > 0) {
      await supabase.from("BidResult").upsert(rows, { onConflict: "annId" });
      saved += rows.length;
    }
    if (page * NUM_OF_ROWS >= totalCount) break;
    page++;
  }
  return saved;
}

async function syncAnnouncementsFromG2B(
  supabase: Awaited<ReturnType<typeof createClient>>,
  days: number,
): Promise<void> {
  const today   = toYMD(new Date());
  const fromDay = toYMD(daysAgo(days));
  let page = 1;

  while (true) {
    const { items, totalCount } = await g2bFetchAnnouncementPage({
      pageNo: page, numOfRows: NUM_OF_ROWS,
      inqryBgnDt: `${fromDay}0000`,
      inqryEndDt: `${today}2359`,
    });
    if (items.length === 0) break;

    const rows = items.map((item: G2BAnnouncement) => {
      const konepsId  = item.bidNtceNo?.trim();
      const title     = item.bidNtceNm?.trim();
      const orgName   = (item.ntceInsttNm || item.demInsttNm)?.trim();
      const budgetNum = parseInt(
        (item.asignBdgtAmt || item.presmptPrce || "0").replace(/[^0-9]/g, ""), 10
      );
      const deadline = g2bParseDate(item.bidClseDt);
      if (!konepsId || !title || !orgName || !budgetNum || !deadline) return null;
      const rawJson: Record<string, string> = {};
      for (const [k, v] of Object.entries(item)) rawJson[k] = String(v ?? "");
      return {
        konepsId, title, orgName,
        budget: String(budgetNum), deadline,
        category: item.ntceKindNm || item.indutyCtgryNm || "",
        region: g2bExtractRegion(item.ntceInsttAddr || ""),
        rawJson,
      };
    }).filter(Boolean);

    if (rows.length > 0) {
      await supabase.from("Announcement").upsert(rows, { onConflict: "konepsId" });
    }
    if (page * NUM_OF_ROWS >= totalCount) break;
    page++;
  }
}

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();

  // BidResult 건수 확인
  const { count: bidCount } = await supabase
    .from("BidResult")
    .select("*", { count: "exact", head: true });

  // 데이터 없으면 G2B에서 on-demand 수집 (90일치)
  if ((bidCount ?? 0) === 0) {
    try {
      await syncAnnouncementsFromG2B(supabase, 90);
      const saved = await syncBidResultsFromG2B(supabase, 90);
      console.log(`[on-demand bid-result sync] 90일치 ${saved}건 저장`);
    } catch (e) {
      console.error("[on-demand bid-result sync 실패]", e);
    }
  }

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

  return NextResponse.json({
    byCategory,
    distribution: distributionArr,
    byNumBidders,
    total: bidResults?.length ?? 0,
  });
}
