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

  const admin = createAdminClient();
  const { data: dbUser } = await admin.from("User").select("plan").eq("supabaseId", user.id).single();
  if (!dbUser || dbUser.plan === "FREE") {
    return NextResponse.json({ error: "PRO_REQUIRED", message: "AI 분석은 프로 플랜부터 이용할 수 있습니다.", upgradeUrl: "/pricing" }, { status: 403 });
  }

  const body = (await request.json()) as { annId?: string; force?: boolean };
  if (!body.annId) {
    return NextResponse.json({ error: "annId 필수" }, { status: 400 });
  }

  // ─── 공고 조회 ─────────────────────────────────────────────────────────────
  const { data: ann } = await admin
    .from("Announcement")
    .select("id,konepsId,title,orgName,budget,deadline,category,region,rawJson,aValueYn,aValueAmt,aValueTotal")
    .or(`id.eq.${body.annId},konepsId.eq.${body.annId}`)
    .maybeSingle();

  if (!ann) return NextResponse.json({ error: "공고 없음" }, { status: 404 });

  const annId = ann.id as string;
  const rawJsonData = ann.rawJson as Record<string, string> | null;
  // A값 파싱 (낙찰하한가 계산용 — estimatedPriceByA는 sajung 계산 후 설정)
  const aValueYn = String(ann.aValueYn ?? "");
  const aValueAmt = Number(ann.aValueAmt ?? 0);
  const budgetNum = aValueAmt > 0 ? aValueAmt : Number(ann.budget) * 1.1;
  const budgetRange = classifyBudget(budgetNum);
  const aValueTotal = Number(ann.aValueTotal ?? 0);
  const isAValue = aValueYn === "Y" && aValueAmt > 0;

  // ─── 이 공고의 기존 분석 의뢰 수 (순번 표시용) ───────────────────────────
  const { count: bidRequestCount } = await admin
    .from("BidRequest")
    .select("id", { count: "exact", head: true })
    .eq("annId", annId)
    .is("cancelledAt", null);

  // ─── 낙찰하한율 파싱 (캐시·분석 공통) ────────────────────────────────────
  const rawJsonEarly = (ann.rawJson as Record<string, string>) ?? {};
  const lowerLimitRateEarly = parseFloat((rawJsonEarly.sucsfbidLwltRate ?? "87.745").replace(/[^0-9.]/g, "")) || 87.745;

  // ─── 24시간 캐시 확인 ──────────────────────────────────────────────────────
  const { data: cached } = await admin
    .from("BidPricePrediction")
    .select("*")
    .eq("annId", annId)
    .gt("expiresAt", new Date().toISOString())
    .maybeSingle();

  // sampleSize=0 또는 sajungRateRange 필드 null인 캐시는 재분석
  const force = body.force === true;
  const cachedRng = cached?.sajungRateRange as { min?: number | null } | null | undefined;
  if (!force && cached && (cached.sampleSize as number) > 0 && cachedRng?.min != null) {
    // trend 는 DB에 저장되지 않으므로 캐시 히트 시에도 보완 계산
    // numberStrategy도 캐시에 없으므로 복수예가 공고는 다시 계산
    const isMultipleCached = isMultiplePriceBid(rawJsonEarly);
    const [rawPoints, numberStrategyCached] = await Promise.all([
      queryRawDataPoints(
        ann.orgName as string,
        ann.category as string,
        budgetRange,
        ann.region as string
      ),
      isMultipleCached
        ? recommendNumbers({
            annId,
            supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
            supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
            category: ann.category as string,
            budgetRange,
            region: ann.region as string,
          }).catch(() => null)
        : Promise.resolve(null),
    ]);
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
    const estimatedPriceByACached = isAValue
      ? budgetNum * ((Number(cached.predictedSajungRate) || 103.8) / 100)
      : null;
    return NextResponse.json(buildResponse(ann, cached, numberStrategyCached, trendMeta, estimatedPriceByACached, aValueTotal, lowerLimitRateEarly, budgetNum, bidRequestCount ?? 0));
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
      aValueTotal,
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

  // ─── A값 예정가 (AI 예측 사정율 기반) ────────────────────────────────────
  const estimatedPriceByA = isAValue
    ? budgetNum * (sajung.predictedSajungRate / 100)
    : null;

  // ─── BidPricePrediction 저장 ───────────────────────────────────────────────
  // Supabase JS SDK는 Prisma @default(cuid()) 를 모르므로 id 직접 생성
  const predRecord = {
    id: crypto.randomUUID(),
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
    expectedBidders: competition.expectedBidders ?? 0,
    dominantCompany: competition.dominantCompany,
    dominantWinRate: competition.dominantWinRate,
    modelVersion: sajung.modelVersion,
    expiresAt: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
  };

  const { error: upsertErr } = await admin.from("BidPricePrediction").upsert(predRecord, { onConflict: "annId" });
  if (upsertErr) console.error("[BidPricePrediction] upsert 실패:", upsertErr.message);

  // ─── AIPrediction 영구 저장 (캐시 만료 후에도 예측 이력 보존) ─────────────
  try {
    await admin.from("AIPrediction").upsert({
      annId,
      konepsId: ann.konepsId as string,
      title: (ann.title as string) ?? "",
      orgName: ann.orgName as string,
      deadline: ann.deadline as string,
      budget: String(ann.budget ?? 0),
      predictedSajungRate: sajung.predictedSajungRate,
      optimalBidPrice: String(sajung.optimalBidPrice),
      lowerLimitRate: lowerLimitRate,
      winProbability: Math.round(((sajung.winProbability as number) ?? 0) * 100),
      competitionScore: competition.competitionScore ?? 0,
      predictedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { onConflict: "annId" });
  } catch (e) {
    console.error("[AIPrediction] 저장 실패:", e);
  }

  const trendMeta: TrendMeta = {
    weightedAvg: sajung.weightedAvg,
    simpleAvg:   sajung.simpleAvg,
    trend:       sajung.trend,
    stabilityScore:   sajung.stabilityScore,
    recentSampleSize: sajung.recentSampleSize,
  };

  return NextResponse.json(buildResponse(ann, predRecord, numberStrategy, trendMeta, estimatedPriceByA, aValueTotal, lowerLimitRate, budgetNum, bidRequestCount ?? 0));
}

// ─── 응답 빌더 ───────────────────────────────────────────────────────────────

function buildResponse(
  ann: Record<string, unknown>,
  pred: Record<string, unknown>,
  numberStrategy: unknown,
  trendMeta?: TrendMeta | null,
  estimatedPriceByA?: number | null,
  aValueTotal?: number,
  lowerLimitRate?: number,
  budgetNum?: number,
  bidRequestCount?: number
) {
  // A값 공고: 낙찰하한가 + 1원 = (예정가 - A합산) × 낙찰하한율 + A합산 + 1
  const aLowerLimit = (estimatedPriceByA != null && aValueTotal != null && lowerLimitRate != null)
    ? Math.round((estimatedPriceByA - aValueTotal) * (lowerLimitRate / 100) + aValueTotal)
    : null;

  return {
    bidStrategy: {
      predictedSajungRate: Number(pred.predictedSajungRate) || 103.8,
      sajungRateRange: (() => {
        const r = pred.sajungRateRange as { min?: number | null; max?: number | null; p25?: number | null; p75?: number | null } | null | undefined;
        return { min: r?.min ?? 97, max: r?.max ?? 112, p25: r?.p25 ?? 101, p75: r?.p75 ?? 106 };
      })(),
      sampleSize: pred.sampleSize,
      optimalBidPrice: (() => {
        // 표준 공식: ROUNDUP((기초금액 × 예측사정률 - A) × 낙찰하한율 + A)
        const budget = budgetNum ?? Number(ann.budget) ?? 0;
        const rate   = Number(pred.predictedSajungRate) || 103.8;
        const llRate = lowerLimitRate ?? 87.745;
        const aVal   = aValueTotal ?? 0;
        const estPrice = budget * (rate / 100);
        const bidPrice = (estPrice - aVal) * (llRate / 100) + aVal;
        return Math.ceil(bidPrice);
      })(),
      bidPriceRangeLow: (() => {
        const budget = budgetNum ?? Number(ann.budget) ?? 0;
        const rate   = Number(pred.predictedSajungRate) || 103.8;
        const llRate = lowerLimitRate ?? 87.745;
        const aVal   = aValueTotal ?? 0;
        const estPrice = budget * (rate / 100);
        return Math.ceil((estPrice - aVal) * (llRate / 100) + aVal);
      })(),
      bidPriceRangeHigh: (() => {
        // 안전 버퍼: 낙찰하한율 +0.5%p
        const budget = budgetNum ?? Number(ann.budget) ?? 0;
        const rate   = Number(pred.predictedSajungRate) || 103.8;
        const llRate = (lowerLimitRate ?? 87.745) + 0.5;
        const aVal   = aValueTotal ?? 0;
        const estPrice = budget * (rate / 100);
        return Math.ceil((estPrice - aVal) * (llRate / 100) + aVal);
      })(),
      lowerLimitPrice: aLowerLimit != null ? aLowerLimit : Number(pred.lowerLimitPrice),
      winProbability: pred.winProbability,
      confidenceLevel: (() => {
        const ss = Number(pred.sampleSize ?? 0);
        if (ss === 0) return "LOW" as const;
        if (ss < 5) return "MEDIUM" as const;
        return "HIGH" as const; // 5건+: 유사업종/ALL 블렌딩 항상 적용
      })(),
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
      budget: budgetNum ?? Number(ann.budget),
      isFallback: (pred.sampleSize as number) < 10,
      disclaimer: "예측 결과는 통계적 참고 자료입니다. 실제 낙찰을 보장하지 않습니다.",
      modelVersion: pred.modelVersion,
      analyzedAt: new Date().toISOString(),
      aValueYn: String(ann.aValueYn ?? ""),
      estimatedPriceByA: estimatedPriceByA ?? null,
      bidRequestCount: bidRequestCount ?? 0,
    },
  };
}
