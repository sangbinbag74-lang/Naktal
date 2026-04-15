import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";
import {
  predictOptimalBid,
  analyzeCompetition,
  classifyBudget,
} from "@/lib/core1/sajung-engine";

export const dynamic = "force-dynamic";

const BATCH_LIMIT = 30;
const DEFAULT_LOWER_LIMIT_RATE = 87.745;

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 인증: Vercel Cron Bearer 또는 x-admin-secret
  const auth = request.headers.get("authorization");
  const secret = request.headers.get("x-admin-secret");
  const cronSecret = process.env.CRON_SECRET;

  const validBearer = cronSecret && auth === `Bearer ${cronSecret}`;
  const validAdmin = secret && secret === process.env.ADMIN_SECRET_KEY;

  if (!validBearer && !validAdmin) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const admin = createAdminClient();

  // 유효한 예측이 없는 진행중 공고 조회
  const now = new Date().toISOString();
  const { data: announcements, error } = await admin
    .from("Announcement")
    .select("id, orgName, category, budget, region, deadline, rawJson")
    .gt("deadline", now)
    .order("deadline", { ascending: true })
    .limit(BATCH_LIMIT * 3); // 스킵 여유분 확보

  if (error || !announcements) {
    console.error("[prefill-predictions] Announcement 조회 실패", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }

  // 이미 유효한 BidPricePrediction이 있는 annId 목록
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

  let filled = 0;
  let skipped = 0;

  for (const ann of targets) {
    const budget = Number(ann.budget ?? 0);
    if (budget <= 0) { skipped++; continue; }

    const rawJson = (ann.rawJson ?? {}) as Record<string, string>;
    const lowerLimitRate = rawJson.sucsfbidLwltRate
      ? Number(rawJson.sucsfbidLwltRate)
      : DEFAULT_LOWER_LIMIT_RATE;

    const deadlineMonth = new Date(ann.deadline as string).getMonth() + 1;
    const budgetRange = classifyBudget(budget);

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

      // 데이터 부족 공고는 저장하지 않음
      if (sajung.optimalBidPrice === 0) {
        skipped++;
        continue;
      }

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

      if (upsertErr) {
        console.error(`[prefill-predictions] upsert 실패 annId=${ann.id}`, upsertErr);
        skipped++;
      } else {
        filled++;
      }
    } catch (err) {
      console.error(`[prefill-predictions] 예측 실패 annId=${ann.id}`, err);
      skipped++;
    }
  }

  console.log(`[prefill-predictions] 완료: filled=${filled}, skipped=${skipped}`);
  return NextResponse.json({ ok: true, filled, skipped, total: targets.length });
}
