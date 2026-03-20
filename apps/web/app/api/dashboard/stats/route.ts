import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const weekAgo    = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [annToday, bidMonth, bidAvg, bidWeek] = await Promise.all([
    // 오늘 신규 공고 수
    supabase.from("Announcement").select("*", { count: "exact", head: true }).gte("createdAt", todayStart),
    // 이번 달 알림 발송 (CrawlLog 기준 - 실제 발송 카운트 대체)
    supabase.from("CrawlLog").select("count", { count: "exact", head: true }).gte("runAt", monthStart),
    // 전체 평균 투찰률
    supabase.from("BidResult").select("bidRate"),
    // 최근 7일 낙찰 건수
    supabase.from("BidResult").select("*", { count: "exact", head: true }).gte("createdAt", weekAgo),
  ]);

  const allRates = (bidAvg.data ?? []).map((r: { bidRate: string }) => parseFloat(r.bidRate));
  const avgBidRate = allRates.length > 0
    ? (allRates.reduce((a, b) => a + b, 0) / allRates.length).toFixed(2)
    : null;

  return NextResponse.json({
    todayAnnouncements: annToday.count ?? 0,
    monthAlerts:        bidMonth.count ?? 0,
    avgBidRate:         avgBidRate ? `${avgBidRate}%` : "-",
    weekBidResults:     bidWeek.count ?? 0,
  });
}
