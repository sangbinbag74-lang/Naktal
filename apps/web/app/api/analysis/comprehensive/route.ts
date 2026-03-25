import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { predictOptimalBid, analyzeCompetition, classifyBudget } from "@/lib/core1/sajung-engine";
import { recommendNumbers } from "@/lib/core1/frequency-engine";
import { isMultiplePriceBid } from "@/lib/bid-utils";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24시간

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 인증
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { annId?: string };
  if (!body.annId) {
    return NextResponse.json({ error: "annId 필수" }, { status: 400 });
  }

  const admin = createAdminClient();

  // ─── 공고 조회 ─────────────────────────────────────────────────────────────
  const { data: ann } = await admin
    .from("Announcement")
    .select("id,konepsId,orgName,budget,deadline,category,region,rawJson")
    .or(`id.eq.${body.annId},konepsId.eq.${body.annId}`)
    .maybeSingle();

  if (!ann) return NextResponse.json({ error: "공고 없음" }, { status: 404 });

  const annId = ann.id as string;

  // ─── 24시간 캐시 확인 ──────────────────────────────────────────────────────
  const { data: cached } = await admin
    .from("BidPricePrediction")
    .select("*")
    .eq("annId", annId)
    .gt("expiresAt", new Date().toISOString())
    .maybeSingle();

  if (cached) {
    return NextResponse.json(buildResponse(ann, cached, null));
  }

  // ─── 공고 메타 파싱 ────────────────────────────────────────────────────────
  const rawJson = (ann.rawJson as Record<string, string>) ?? {};
  const lowerLimitRateRaw = rawJson.sucsfbidLwltRate ?? "87.745";
  const lowerLimitRate = parseFloat(lowerLimitRateRaw.replace(/[^0-9.]/g, "")) || 87.745;

  const budget = Number(ann.budget);
  const deadline = new Date(ann.deadline as string);
  const deadlineMonth = deadline.getMonth() + 1;

  // ─── 병렬 분석 ─────────────────────────────────────────────────────────────
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

  // 복수예가 번호 추천 (복수예가 공고만)
  let numberStrategy = null;
  if (isMultiplePriceBid(rawJson)) {
    try {
      numberStrategy = await recommendNumbers({
        category: ann.category as string,
        budgetRange: classifyBudget(budget),
        region: ann.region as string,
        estimatedBidders: competition.expectedBidders,
      });
    } catch {
      // 번호 추천 실패는 무시
    }
  }

  // ─── BidPricePrediction 저장 ───────────────────────────────────────────────
  const predRecord = {
    annId,
    predictedSajungRate: sajung.predictedSajungRate,
    sajungRateRange: sajung.sajungRateRange,
    sampleSize: sajung.sampleSize,
    optimalBidPrice: String(sajung.optimalBidPrice),
    bidPriceRangeLow: String(sajung.bidPriceRangeLow),
    bidPriceRangeHigh: String(sajung.bidPriceRangeHigh),
    lowerLimitPrice: String(sajung.lowerLimitPrice),
    winProbability: sajung.winProbability,
    competitionScore: competition.competitionScore,
    expectedBidders: competition.expectedBidders,
    dominantCompany: competition.dominantCompany,
    dominantWinRate: competition.dominantWinRate,
    modelVersion: sajung.modelVersion,
    expiresAt: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
  };

  await admin.from("BidPricePrediction").upsert(predRecord, { onConflict: "annId" });

  return NextResponse.json(buildResponse(ann, predRecord, numberStrategy));
}

// ─── 응답 빌더 ───────────────────────────────────────────────────────────────

function buildResponse(
  ann: Record<string, unknown>,
  pred: Record<string, unknown>,
  numberStrategy: unknown
) {
  return {
    bidStrategy: {
      predictedSajungRate: pred.predictedSajungRate,
      sajungRateRange: pred.sajungRateRange,
      sampleSize: pred.sampleSize,
      optimalBidPrice: Number(pred.optimalBidPrice),
      bidPriceRangeLow: Number(pred.bidPriceRangeLow),
      bidPriceRangeHigh: Number(pred.bidPriceRangeHigh),
      lowerLimitPrice: Number(pred.lowerLimitPrice),
      winProbability: pred.winProbability,
      numberStrategy,
    },
    competition: {
      competitionScore: pred.competitionScore,
      expectedBidders: pred.expectedBidders,
      dominantCompany: pred.dominantCompany,
      dominantWinRate: pred.dominantWinRate,
    },
    meta: {
      annId: ann.id,
      orgName: ann.orgName,
      budget: Number(ann.budget),
      isFallback: (pred.sampleSize as number) < 10,
      disclaimer: "예측 결과는 통계적 참고 자료입니다. 실제 낙찰을 보장하지 않습니다.",
      modelVersion: pred.modelVersion,
      analyzedAt: new Date().toISOString(),
    },
  };
}
