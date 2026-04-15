/**
 * POST /api/admin/run-predictions
 * 현재 진행중 공고 중 BidPricePrediction 없는 건을 일괄 분석 (최대 50건/호출)
 * 클라이언트에서 반복 호출하여 전체 처리 가능
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";
import {
  predictOptimalBid,
  analyzeCompetition,
  classifyBudget,
} from "@/lib/core1/sajung-engine";

const BATCH_LIMIT = 50;
const DEFAULT_LOWER_LIMIT_RATE = 87.745;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // 진행중 공고 조회 (마감 안 된 것)
  const { data: announcements, error } = await admin
    .from("Announcement")
    .select("id, orgName, category, budget, region, deadline, rawJson")
    .gt("deadline", now)
    .order("deadline", { ascending: true })
    .limit(BATCH_LIMIT * 3);

  if (error || !announcements) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }

  // 이미 유효한 예측이 있는 공고 제외
  const annIds = announcements.map((a) => a.id as string);
  const { data: existing } = await admin
    .from("BidPricePrediction")
    .select("annId")
    .in("annId", annIds)
    .gt("expiresAt", now);

  const existingSet = new Set((existing ?? []).map((r) => r.annId as string));
  const targets = announcements
    .filter((a) => !existingSet.has(a.id as string))
    .slice(0, BATCH_LIMIT);

  // remaining: 아직 처리 안 된 건 수 (이번 배치 제외)
  const remaining = announcements.filter((a) => !existingSet.has(a.id as string)).length - targets.length;

  let filled = 0;
  let skipped = 0;

  for (const ann of targets) {
    const budget = Number(ann.budget ?? 0);
    if (budget <= 0) { skipped++; continue; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawJson = (ann.rawJson ?? {}) as Record<string, string>;
    const lowerLimitRate = rawJson.sucsfbidLwltRate
      ? Number(rawJson.sucsfbidLwltRate)
      : DEFAULT_LOWER_LIMIT_RATE;

    const deadlineMonth = new Date(ann.deadline as string).getMonth() + 1;
    // classifyBudget은 sajung-engine에서 사용하지만 여기서도 필요할 경우 대비
    void classifyBudget;

    try {
      const [sajung, competition] = await Promise.all([
        predictOptimalBid({
          orgName: ann.orgName as string,
          category: ann.category as string,
          budget,
          region: ann.region as string,
          lowerLimitRate,
          deadlineMonth,
        }),
        analyzeCompetition({
          orgName: ann.orgName as string,
          category: ann.category as string,
          budget,
          region: ann.region as string,
          deadlineMonth,
        }),
      ]);

      if (sajung.optimalBidPrice === 0) { skipped++; continue; }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { error: upsertErr } = await admin
        .from("BidPricePrediction")
        .upsert(
          {
            id: randomUUID(),
            annId: ann.id,
            predictedSajungRate: sajung.predictedSajungRate,
            sajungRateRange: sajung.sajungRateRange,
            sampleSize: sajung.sampleSize,
            optimalBidPrice: String(Math.round(sajung.optimalBidPrice)),
            bidPriceRangeLow: String(Math.round(sajung.bidPriceRangeLow)),
            bidPriceRangeHigh: String(Math.round(sajung.bidPriceRangeHigh)),
            lowerLimitPrice: String(Math.round(sajung.lowerLimitPrice)),
            winProbability: sajung.winProbability,
            competitionScore: competition.competitionScore,
            expectedBidders: competition.expectedBidders,
            dominantCompany: competition.dominantCompany ?? null,
            dominantWinRate: competition.dominantWinRate ?? null,
            modelVersion: "core1-v1",
            expiresAt,
          },
          { onConflict: "annId" }
        );

      if (upsertErr) { skipped++; } else { filled++; }
    } catch {
      skipped++;
    }
  }

  return NextResponse.json({ ok: true, filled, skipped, total: targets.length, remaining });
}
