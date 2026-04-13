import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  predictOptimalBid,
  analyzeCompetition,
  classifyBudget,
  queryRawDataPoints,
  calcWeightedAvgSajung,
  calcTrend,
  calcStabilityScore,
  type TrendResult,
} from "@/lib/core1/sajung-engine";
import { recommendNumbers } from "@/lib/core1/frequency-engine";
import { isMultiplePriceBid } from "@/lib/bid-utils";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24시간

interface TrendMeta {
  weightedAvg: number | null;
  simpleAvg: number | null;
  trend: TrendResult;
  stabilityScore: number;
  recentSampleSize: number;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 인증
  const supabase = await createClient();
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
    .select("id,konepsId,orgName,budget,deadline,category,region,rawJson,aValueYn,aValueAmt,aValueTotal")
    .or(`id.eq.${body.annId},konepsId.eq.${body.annId}`)
    .maybeSingle();

  if (!ann) return NextResponse.json({ error: "공고 없음" }, { status: 404 });

  const annId = ann.id as string;
  const budgetNum = Number(ann.budget);
  const budgetRange = classifyBudget(budgetNum);

  // A값 적용 공고: 예정가격 = 기초금액(aValueAmt) + A합산(aValueTotal)
  const aValueYn = String(ann.aValueYn ?? "");
  const aValueAmt = Number(ann.aValueAmt ?? 0);
  const aValueTotal = Number(ann.aValueTotal ?? 0);
  const estimatedPriceByA = (aValueYn === "Y" && aValueAmt > 0)
    ? aValueAmt + aValueTotal
    : null;

  // ─── 24시간 캐시 확인 ──────────────────────────────────────────────────────
  const { data: cached } = await admin
    .from("BidPricePrediction")
    .select("*")
    .eq("annId", annId)
    .gt("expiresAt", new Date().toISOString())
    .maybeSingle();

  // sampleSize=0 또는 sajungRateRange 필드 null인 캐시는 재분석
  const cachedRng = cached?.sajungRateRange as { min?: number | null } | null | undefined;
  if (cached && (cached.sampleSize as number) > 0 && cachedRng?.min != null) {
    // trend 는 DB에 저장되지 않으므로 캐시 히트 시에도 보완 계산
    const rawPoints = await queryRawDataPoints(
      ann.orgName as string,
      ann.category as string,
      budgetRange,
      ann.region as string
    );
    const trendMeta: TrendMeta = {
      weightedAvg: rawPoints.length >= 5
        ? Math.round(calcWeightedAvgSajung(rawPoints) * 1000) / 1000
        : null,
      simpleAvg: rawPoints.length >= 5
        ? Math.round(rawPoints.reduce((s, p) => s + p.sajung, 0) / rawPoints.length * 1000) / 1000
        : null,
      trend: calcTrend(rawPoints),
      stabilityScore: Math.round(calcStabilityScore(rawPoints) * 1000) / 1000,
      recentSampleSize: rawPoints.filter(
        p => Date.now() - new Date(p.deadline).getTime() < 365 * 24 * 60 * 60 * 1000
      ).length,
    };
    const aValueYnCached = String(ann.aValueYn ?? "");
    const estimatedPriceByACached = (aValueYnCached === "Y" && Number(ann.aValueAmt ?? 0) > 0)
      ? Number(ann.aValueAmt ?? 0) + Number(ann.aValueTotal ?? 0)
      : null;
    return NextResponse.json(buildResponse(ann, cached, null, trendMeta, estimatedPriceByACached));
  }

  // ─── 공고 메타 파싱 ────────────────────────────────────────────────────────
  const rawJson = (ann.rawJson as Record<string, string>) ?? {};
  const lowerLimitRateRaw = rawJson.sucsfbidLwltRate ?? "87.745";
  const lowerLimitRate = parseFloat(lowerLimitRateRaw.replace(/[^0-9.]/g, "")) || 87.745;

  const deadline = new Date(ann.deadline as string);
  const deadlineMonth = deadline.getMonth() + 1;

  // ─── 병렬 분석 (sajung + competition + numberStrategy 동시 실행) ──────────
  const isMultiple = isMultiplePriceBid(rawJson);

  const [sajung, competition, numberStrategy] = await Promise.all([
    predictOptimalBid({
      orgName: ann.orgName as string,
      category: ann.category as string,
      budget: budgetNum,
      region: ann.region as string,
      lowerLimitRate,
      deadlineMonth,
    }),
    analyzeCompetition({
      orgName: ann.orgName as string,
      category: ann.category as string,
      budget: budgetNum,
      region: ann.region as string,
      deadlineMonth,
    }),
    isMultiple
      ? recommendNumbers({
          annId: ann.id as string,
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
          supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          category: ann.category as string,
          budgetRange,
          region: ann.region as string,
        }).catch(() => null)
      : Promise.resolve(null),
  ]);

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

  const trendMeta: TrendMeta = {
    weightedAvg: sajung.weightedAvg,
    simpleAvg:   sajung.simpleAvg,
    trend:       sajung.trend,
    stabilityScore:   sajung.stabilityScore,
    recentSampleSize: sajung.recentSampleSize,
  };

  return NextResponse.json(buildResponse(ann, predRecord, numberStrategy, trendMeta, estimatedPriceByA));
}

// ─── 응답 빌더 ───────────────────────────────────────────────────────────────

function buildResponse(
  ann: Record<string, unknown>,
  pred: Record<string, unknown>,
  numberStrategy: unknown,
  trendMeta?: TrendMeta | null,
  estimatedPriceByA?: number | null
) {
  return {
    bidStrategy: {
      predictedSajungRate: Number(pred.predictedSajungRate) || 103.8,
      sajungRateRange: (() => {
        const r = pred.sajungRateRange as { min?: number | null; max?: number | null; p25?: number | null; p75?: number | null } | null | undefined;
        return { min: r?.min ?? 97, max: r?.max ?? 112, p25: r?.p25 ?? 101, p75: r?.p75 ?? 106 };
      })(),
      sampleSize: pred.sampleSize,
      optimalBidPrice: estimatedPriceByA != null
        ? Math.round(estimatedPriceByA * 0.9997)
        : Number(pred.optimalBidPrice),
      bidPriceRangeLow: Number(pred.bidPriceRangeLow),
      bidPriceRangeHigh: Number(pred.bidPriceRangeHigh),
      lowerLimitPrice: Number(pred.lowerLimitPrice),
      winProbability: pred.winProbability,
      numberStrategy,
      weightedAvg:       trendMeta?.weightedAvg ?? null,
      simpleAvg:         trendMeta?.simpleAvg ?? null,
      trend:             trendMeta?.trend ?? null,
      stabilityScore:    trendMeta?.stabilityScore ?? null,
      recentSampleSize:  trendMeta?.recentSampleSize ?? null,
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
      aValueYn: String(ann.aValueYn ?? ""),
      estimatedPriceByA: estimatedPriceByA ?? null,
    },
  };
}
