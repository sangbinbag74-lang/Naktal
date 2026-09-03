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
import { Feature, getLimit } from "@/lib/plan-guard";
import { isMultiplePriceBid } from "@/lib/bid-utils";
import { calcBaseBudget } from "@/lib/analysis/sajung-utils";
import { classifyCategory, DEFAULT_SAJUNG_BY_KIND, DEFAULT_LWLT_BY_KIND, getDefaultLwlt } from "@/lib/analysis/category-config";
import { applySajungNoise, calcBidPrice } from "@/lib/core1/noise";
import { rateLimit } from "@/lib/rate-limit";

// 첫 호출 시 ensemble route cold start (onnx 22MB) + sajung-engine 통계 조회 + BidPricePrediction 저장
// → 박상빈님 5/17 명시 ensemble 호출 보장 위해 60초 (Vercel Hobby 한도)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const { data: dbUser } = await admin.from("User").select("id,plan,grandfathered").eq("supabaseId", user.id).single();
  if (!dbUser) {
    return NextResponse.json({ error: "USER_NOT_FOUND", message: "사용자 정보를 찾을 수 없습니다." }, { status: 403 });
  }
  // 5티어 (2026-07-09): FREE도 분석 가능 — 월 3건 크레딧, 초과 시 정밀값 마스킹(blurred)
  //  grandfathered = 전환 전 기존 회원 영구 PRO
  const userPlan = (dbUser.grandfathered ? "PRO" : dbUser.plan) as import("@naktal/types").Plan;

  // 사용자 분당 20회 — ML/DB 비용 보호 (24시간 캐시 있어도 첫 호출 비싸므로)
  const { allowed: rlAllowed, resetAt: rlReset } = await rateLimit(`${dbUser.id}:comprehensive`, 20, 60);
  if (!rlAllowed) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rlReset.getTime() - Date.now()) / 1000)) } },
    );
  }

  const body = (await request.json()) as { annId?: string; force?: boolean };
  if (!body.annId) {
    return NextResponse.json({ error: "annId 필수" }, { status: 400 });
  }

  // FREE 월 크레딧 (공고 단위 unlock — 같은 공고 재열람은 재소모 없음)
  // 한도는 plan-guard 가 단일 소스. 전면 무료 개방(FREE_OPEN_ALL) 시 Infinity 라 블러 처리되지 않는다.
  let freeBlurred = false;
  const freeCredit = getLimit(userPlan, Feature.CORE1_NUMBER_RECOMMEND);
  const creditYm = new Date().toISOString().slice(0, 7); // YYYY-MM
  const unlockKey = `unlock:${dbUser.id}:${body.annId}:${creditYm}`;
  if (userPlan === "FREE" && Number.isFinite(freeCredit)) {
    const { count: unlocked } = await admin
      .from("RateLimit")
      .select("key", { count: "exact", head: true })
      .eq("key", unlockKey);
    if ((unlocked ?? 0) === 0) {
      const { count: used } = await admin
        .from("RateLimit")
        .select("key", { count: "exact", head: true })
        .like("key", `unlock:${dbUser.id}:%:${creditYm}`);
      if ((used ?? 0) >= freeCredit) freeBlurred = true;
    }
  }

  // ─── 공고 조회 (활성 우선, 마감 공고 폴백) ────────────────────────────────
  // 2026-05-09: AnnouncementActive MV (14k row) 활용 — 749만 → 14k
  let { data: ann } = await admin
    .from("Announcement")
    .select("id,konepsId,title,orgName,budget,deadline,category,region,rawJson,aValueYn,aValueAmt,aValueTotal,bsisAmt,subCategories")
    .gt("deadline", new Date().toISOString())
    .or(`id.eq.${body.annId},konepsId.eq.${body.annId}`)
    .maybeSingle();

  if (!ann) {
    // 마감 공고 폴백 — Announcement 본 테이블
    const { data: archived } = await admin
      .from("Announcement")
      .select("id,konepsId,title,orgName,budget,deadline,category,region,rawJson,aValueYn,aValueAmt,aValueTotal,bsisAmt,subCategories")
      .or(`id.eq.${body.annId},konepsId.eq.${body.annId}`)
      .maybeSingle();
    ann = archived;
  }

  if (!ann) return NextResponse.json({ error: "공고 없음" }, { status: 404 });

  const annId = ann.id as string;
  const rawJsonData = ann.rawJson as Record<string, string> | null;
  // A값 파싱 (낙찰하한가 계산용 — estimatedPriceByA는 sajung 계산 후 설정)
  const aValueYn = String(ann.aValueYn ?? "");
  const aValueAmt = Number(ann.aValueAmt ?? 0);
  // 기초금액 우선순위: bsisAmt > aValueAmt > 추정가격×1.1 (page.tsx·sajung-utils 통일)
  const budgetNum = calcBaseBudget(ann as { budget: number; aValueAmt: number; bsisAmt: bigint | number });
  const budgetRange = classifyBudget(budgetNum);
  const aValueTotal = Number(ann.aValueTotal ?? 0);
  const isAValue = aValueYn === "Y" && aValueAmt > 0;

  // ─── 이 공고의 기존 분석 의뢰 수 (순번 표시용) ───────────────────────────
  const { count: bidRequestCount } = await admin
    .from("BidRequest")
    .select("id", { count: "exact", head: true })
    .eq("annId", annId)
    .is("cancelledAt", null);

  // ─── 낙찰하한율 파싱 (캐시·분석 공통) — 2026.1.30 개정 반영 ────────────────
  // 예산구간별 폴백 (공사 10억 미만 89.745% / 10~50억 88.745% / 50~100억 87.495%)
  const rawJsonEarly = (ann.rawJson as Record<string, string>) ?? {};
  const annCategory = ann.category as string;
  const annKind = classifyCategory(annCategory);
  const defaultLwlt = getDefaultLwlt(annCategory, budgetNum);
  const defaultSajung = DEFAULT_SAJUNG_BY_KIND[annKind];
  const lwltRaw = rawJsonEarly.sucsfbidLwltRate ?? "";
  const lowerLimitRateEarly = parseFloat(lwltRaw.replace(/[^0-9.]/g, "")) || defaultLwlt;

  // ─── 분석 캐시 확인 (2026-07-10 박상빈님: 한 번 분석한 공고는 항상 즉시 표시) ─
  //  row 는 annId upsert 로 영구 보존 — 만료(expiresAt 경과)여도 즉시 반환하고 stale 표시.
  //  fresh 재계산은 force=true(재분석 버튼)로만 → cold start 60초 재발 방지.
  const { data: cached } = await admin
    .from("BidPricePrediction")
    .select("*")
    .eq("annId", annId)
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
      ? budgetNum * ((Number(cached.predictedSajungRate) || defaultSajung.center) / 100)
      : null;
    const cachedPayload = buildResponse(ann, cached, numberStrategyCached, trendMeta, estimatedPriceByACached, aValueTotal, lowerLimitRateEarly, budgetNum, bidRequestCount ?? 0, annKind, user.id);
    (cachedPayload.meta as unknown as Record<string, unknown>).stale =
      new Date(String(cached.expiresAt)) < new Date(); // 24h 경과 표시 (재분석 버튼으로 갱신 가능)
    // FREE 크레딧 게이트 — 캐시 경로에도 동일 적용 (마스킹 우회 구멍 봉합, 2026-07-10)
    return finalizeFreeGate(cachedPayload, { admin, userPlan, freeBlurred, unlockKey, freeCredit });
  }

  // ─── 공고 메타 파싱 ────────────────────────────────────────────────────────
  const rawJson = (ann.rawJson as Record<string, string>) ?? {};
  const lowerLimitRateRaw = rawJson.sucsfbidLwltRate ?? "";
  const lowerLimitRate = parseFloat(lowerLimitRateRaw.replace(/[^0-9.]/g, "")) || defaultLwlt;
  if (lowerLimitRate <= 0) {
    console.warn("[comprehensive] 낙찰하한율 미상 (종합심사 또는 100억+ 공사) — 분석 거부:", annId);
    return NextResponse.json({ error: "ANALYSIS_NOT_SUPPORTED", message: "이 공고는 적격심사 대상이 아닙니다." }, { status: 422 });
  }

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
      deadlineDate: ann.deadline as string,
      bsisAmt: Number(ann.bsisAmt ?? 0),
      subCategories: (ann.subCategories as string[]) ?? [],
      // 박상빈님 5/21 K-2 박스권 ML — annId + userId hash → q40~q70 deterministic 다양화
      annId,
      userId: user.id,
      // 박상빈님 7/9 a안 — PRO 이상 = 개인화 보정 0, AI 원본값(운영점) 그대로
      originValue: userPlan === "PRO" || userPlan === "BIZ" || userPlan === "MASTER",
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
    // F15 (박상빈님 5/18) — 자동 확장 + 가격결정방식 영구 저장
    originalSampleSize: sajung.originalSampleSize,
    blendedSampleSize: sajung.blendedSampleSize,
    isBlended: sajung.isBlended,
    priceMethod: (ann.rawJson as { prearngPrceDcsnMthdNm?: string } | null)?.prearngPrceDcsnMthdNm ?? null,
    expiresAt: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
  };

  // 박상빈님 5/17 명시: 박상빈님 계약 진입 보장 — isFallback 도 BidPricePrediction 저장
  // (ML ensemble v2+xgb+cat 결과는 sampleSize 무관하게 신뢰 가능, 노이즈 미러 적용)
  // fallback 표시는 modelVersion 에 [fallback] suffix 로 표기 → bid-request 등 호출자가 식별 가능
  const isUnreliable = sajung.sampleSize === 0 || sajung.isFallback;
  if (isUnreliable) {
    predRecord.modelVersion = `${predRecord.modelVersion ?? ""}[fallback]`;
    console.warn("[comprehensive] fallback 으로 BidPricePrediction 저장:", { annId, sampleSize: sajung.sampleSize, isFallback: sajung.isFallback });
  }
  const { error: upsertErr } = await admin.from("BidPricePrediction").upsert(predRecord, { onConflict: "annId" });
  if (upsertErr) console.error("[BidPricePrediction] upsert 실패:", upsertErr.message);

  // ─── AIPrediction 영구 저장 — fallback 차단 (BidPricePrediction 과 동일 정책)
  // 데이터 부족(sampleSize=0 or isFallback) 시 적재 차단 — 적중률 통계 오염 방지
  if (!isUnreliable) {
    try {
      await admin.from("AIPrediction").upsert({
        id: crypto.randomUUID(),
        annId,
        konepsId: ann.konepsId as string,
        title: (ann.title as string) ?? "",
        orgName: ann.orgName as string,
        deadline: ann.deadline as string,
        budget: String(ann.budget ?? 0),
        predictedSajungRate: sajung.predictedSajungRate,
        optimalBidPrice: String(sajung.optimalBidPrice),
        bidPriceRangeLow: String(sajung.bidPriceRangeLow),
        bidPriceRangeHigh: String(sajung.bidPriceRangeHigh),
        lowerLimitRate: lowerLimitRate,
        winProbability: Math.round(((sajung.winProbability as number) ?? 0) * 100),
        competitionScore: competition.competitionScore ?? 0,
        sampleSize: sajung.sampleSize ?? 0,
        predictedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { onConflict: "annId" });
    } catch (e) {
      console.error("[AIPrediction] 저장 실패:", e);
    }
  } else {
    console.warn("[comprehensive] 데이터 부족으로 AIPrediction 미저장:", { annId, sampleSize: sajung.sampleSize, isFallback: sajung.isFallback });
  }

  const trendMeta: TrendMeta = {
    weightedAvg: sajung.weightedAvg,
    simpleAvg:   sajung.simpleAvg,
    trend:       sajung.trend,
    stabilityScore:   sajung.stabilityScore,
    recentSampleSize: sajung.recentSampleSize,
  };

  const payload = buildResponse(ann, predRecord, numberStrategy, trendMeta, estimatedPriceByA, aValueTotal, lowerLimitRate, budgetNum, bidRequestCount ?? 0, annKind, user.id);
  return finalizeFreeGate(payload, { admin, userPlan, freeBlurred, unlockKey, freeCredit });
}

// ─── FREE 크레딧 게이트 (5티어, 2026-07-09 / 캐시·fresh 두 경로 공용 2026-07-10) ──
//  소진 전: unlock 기록(같은 공고 재열람 무료) / 소진: 정밀필드 마스킹, 박스권(range)은 유지
async function finalizeFreeGate(
  payload: ReturnType<typeof buildResponse>,
  ctx: { admin: ReturnType<typeof createAdminClient>; userPlan: string; freeBlurred: boolean; unlockKey: string; freeCredit: number },
): Promise<NextResponse> {
  if (ctx.userPlan === "FREE") {
    if (ctx.freeBlurred) {
      const bs = payload.bidStrategy as unknown as Record<string, unknown>;
      bs.predictedSajungRate = null; // 정밀 사정율 마스킹 (sajungRateRange 박스권은 그대로 공개)
      bs.mlPredictedSajungRate = null;
      bs.optimalBidPrice = null;
      bs.bidPriceRangeLow = null;
      bs.bidPriceRangeHigh = null;
      bs.lowerLimitPrice = null;
      bs.numberStrategy = null;
      const meta = payload.meta as unknown as Record<string, unknown>;
      meta.blurred = true;
      meta.blurReason = "FREE_CREDIT_EXHAUSTED";
      meta.creditLimit = ctx.freeCredit;
      meta.upgradeUrl = "/billing";
    } else {
      // 크레딧 소모 기록 (월말 만료) — 실패해도 응답은 정상 진행
      const monthEnd = new Date();
      monthEnd.setMonth(monthEnd.getMonth() + 1, 1);
      monthEnd.setHours(0, 0, 0, 0);
      const { error: unlockErr } = await ctx.admin.from("RateLimit").upsert(
        { id: crypto.randomUUID(), key: ctx.unlockKey, count: 1, resetAt: monthEnd.toISOString(), updatedAt: new Date().toISOString() },
        { onConflict: "key" },
      );
      if (unlockErr) console.error("[comprehensive] FREE unlock 기록 실패:", unlockErr.message);
    }
  }
  return NextResponse.json(payload);
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
  bidRequestCount?: number,
  kind?: ReturnType<typeof classifyCategory>,
  userId?: string,
) {
  // 카테고리별 default (호출자 미전달 시 ann.category 로 추정)
  const annKind = kind ?? classifyCategory(ann.category as string);
  const sd = DEFAULT_SAJUNG_BY_KIND[annKind];
  const dl = DEFAULT_LWLT_BY_KIND[annKind];

  // 박상빈님 5/19 명시 B-q70-M1 = noise X 채택 (ensemble 자체가 균형 = 추가 노이즈 X)
  const mlRate = Number(pred.predictedSajungRate) || sd.center;
  const effRate = mlRate;

  // A값 공고: 낙찰하한가 + 1원 = (예정가 - A합산) × 낙찰하한율 + A합산 + 1
  const aLowerLimit = (estimatedPriceByA != null && aValueTotal != null && lowerLimitRate != null)
    ? Math.round((estimatedPriceByA - aValueTotal) * (lowerLimitRate / 100) + aValueTotal)
    : null;

  return {
    bidStrategy: {
      // 화면 표시 사정율 = 노이즈 적용값 (G2B 계산기 입력 시 동일 결과)
      predictedSajungRate: effRate,
      // ML 원본 사정율 (감사·통계용)
      mlPredictedSajungRate: mlRate,
      sajungRateRange: (() => {
        const r = pred.sajungRateRange as { min?: number | null; max?: number | null; p25?: number | null; p75?: number | null } | null | undefined;
        return { min: r?.min ?? sd.min, max: r?.max ?? sd.max, p25: r?.p25 ?? sd.p25, p75: r?.p75 ?? sd.p75 };
      })(),
      sampleSize: pred.sampleSize,
      optimalBidPrice: (() => {
        // 박상빈님 지시 (2026-05-17): 안전마진 + Hard clamp 완전 제거. AI 예측 사정율 그대로.
        // calcBidPrice 가 noise.ts 에서 마진/clamp 없는 단순 역산만 수행
        const budget = budgetNum ?? Number(ann.budget) ?? 0;
        const llRate = lowerLimitRate ?? dl;
        const aVal   = aValueTotal ?? 0;
        const { safeBid } = calcBidPrice(budget, effRate, llRate, aVal);
        return safeBid;
      })(),
      bidPriceRangeLow: (() => {
        // 박상빈님 지시 (2026-05-17): 안전마진 + Hard clamp 완전 제거. AI 예측 사정율 그대로.
        const budget = budgetNum ?? Number(ann.budget) ?? 0;
        const llRate = lowerLimitRate ?? dl;
        const aVal   = aValueTotal ?? 0;
        const estPrice = budget * (effRate / 100);
        return Math.ceil((estPrice - aVal) * (llRate / 100) + aVal);
      })(),
      bidPriceRangeHigh: (() => {
        // 박상빈님 지시 (2026-05-17): 안전마진 + Hard clamp 완전 제거. AI 예측 사정율 그대로.
        const budget = budgetNum ?? Number(ann.budget) ?? 0;
        const llRate = lowerLimitRate ?? dl;
        const aVal   = aValueTotal ?? 0;
        const estPrice = budget * (effRate / 100);
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
