/**
 * CORE 1: 사정율 기반 최적 투찰가 예측 + 경쟁 강도 분석
 *
 * 사정율 = 예정가격 ÷ 기초금액 × 100
 * 예정가격 = 낙찰금액 ÷ (낙찰률 ÷ 100)
 * 유효 범위: 97~103%
 */

import { createAdminClient } from "@/lib/supabase/server";
import { extractCoreOrgName } from "@/lib/analysis/sajung-utils";
import { SIMILAR_CATEGORIES } from "@/lib/category-map";
import { fetchMlSajung } from "./ml-client";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export interface TrendResult {
  slope: number;
  direction: "up" | "down" | "stable";
  strength: "strong" | "moderate" | "weak";
  adjustment: number;
  description: string;
}

export interface SajungPrediction {
  predictedSajungRate: number;
  sajungRateRange: { min: number; max: number; p25: number; p75: number };
  sampleSize: number;
  optimalBidPrice: number;
  bidPriceRangeLow: number;
  bidPriceRangeHigh: number;
  lowerLimitPrice: number;
  winProbability: number;
  isFallback: boolean;    // 'ALL' orgName 폴백 여부
  confidenceLevel: ConfidenceLevel;
  modelVersion: string;
  weightedAvg: number;
  simpleAvg: number;
  trend: TrendResult;
  stabilityScore: number;
  recentSampleSize: number;
}

function getConfidenceLevel(
  sampleSize: number,
  stddev: number,
  recentSampleSize: number,
  stabilityScore: number,
  isBlended = false
): ConfidenceLevel {
  // 업종 전체 데이터와 블렌딩된 경우: 발주처 특화 건수가 5건 이상이면 충분히 신뢰 가능
  if (isBlended) {
    if (sampleSize >= 5) return "HIGH";
    return "MEDIUM";
  }
  if (sampleSize >= 10 && recentSampleSize >= 5 && stabilityScore >= 0.7) return "HIGH";
  if (sampleSize >= 5  && recentSampleSize >= 3) return "MEDIUM";
  // fallback: legacy stddev-based check
  if (sampleSize >= 10 && stddev <= 0.6) return "HIGH";
  if (sampleSize >= 10 && stddev <= 1.0) return "MEDIUM";
  return "LOW";
}

export interface CompetitionResult {
  competitionScore: number;      // 0~100
  scoreLevel: "낮음" | "보통" | "높음" | "매우높음";
  expectedBidders: number | null;
  dominantCompany: string | null;
  dominantWinRate: number | null;  // 0~1
  seasonEffect: boolean;
}

interface SajungStatRow {
  avg: number;
  stddev: number;
  p25: number;
  p50: number;
  p75: number;
  min: number;
  max: number;
  mode: number;
  monthlyAvg: Record<string, number>;
  sampleSize: number;
}

// ─── 예산 구간 분류 (build-stat-cache.ts와 동일) ──────────────────────────────

export function classifyBudget(budget: number): string {
  if (budget < 100_000_000)   return "1억미만";
  if (budget < 300_000_000)   return "1억-3억";
  if (budget < 1_000_000_000) return "3억-10억";
  if (budget < 3_000_000_000) return "10억-30억";
  return "30억이상";
}

// ─── Box-Muller 정규분포 난수 ─────────────────────────────────────────────────

function normalRandom(mean: number, std: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ─── 프론트 JS와 동일한 몬테카를로 (서버 버전, N=5000) ───────────────────────

function monteCarloWinProb(
  myBid: number,
  budget: number,
  sajungMean: number,
  sajungStd: number,
  lowerLimitRate: number,
  n = 5000
): number {
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const simSajung = normalRandom(sajungMean, sajungStd);
    const simPrice  = budget * (simSajung / 100);
    const simLower  = simPrice * (lowerLimitRate / 100);
    if (myBid >= simLower && myBid <= simPrice) wins++;
  }
  return wins / n;
}

// ─── SajungRateStat 조회 ──────────────────────────────────────────────────────

async function querySajungStat(
  orgName: string,
  category: string,
  budgetRange: string,
  region: string
): Promise<SajungStatRow | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("SajungRateStat")
    .select("avg,stddev,p25,p50,p75,min,max,mode,monthlyAvg,sampleSize")
    .eq("orgName", orgName)
    .eq("category", category)
    .eq("budgetRange", budgetRange)
    .eq("region", region)
    .maybeSingle();
  return data as SajungStatRow | null;
}

// ─── 시계열 가중치 ─────────────────────────────────────────────────────────────

export function getTimeWeight(deadlineDate: Date): number {
  const diffMonths = (Date.now() - deadlineDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
  if (diffMonths <= 3)  return 3.0;
  if (diffMonths <= 6)  return 2.0;
  if (diffMonths <= 12) return 1.5;
  if (diffMonths <= 24) return 1.0;
  return 0.5;
}

// ─── 시계열 가중 평균 사정율 ──────────────────────────────────────────────────

export function calcWeightedAvgSajung(
  points: { sajung: number; deadline: string }[]
): number {
  if (points.length === 0) return 100;
  let wSum = 0, wTotal = 0;
  for (const p of points) {
    const w = getTimeWeight(new Date(p.deadline));
    wSum += p.sajung * w;
    wTotal += w;
  }
  return wTotal > 0 ? wSum / wTotal : 100;
}

// ─── 추세 분석 ────────────────────────────────────────────────────────────────

export function calcTrend(
  points: { sajung: number; deadline: string }[],
  recentN = 8
): TrendResult {
  const stableDefault: TrendResult = {
    slope: 0, direction: "stable", strength: "weak", adjustment: 0,
    description: "최근 사정율이 안정적으로 유지되고 있습니다.",
  };
  if (points.length < 4) return stableDefault;

  const recent = [...points]
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .slice(-recentN);
  const n = recent.length;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (let i = 0; i < n; i++) {
    const sajung = recent[i]?.sajung ?? 0;
    sx  += i;
    sy  += sajung;
    sxy += i * sajung;
    sx2 += i * i;
  }
  const denom = n * sx2 - sx * sx;
  if (denom === 0) return stableDefault;

  const slope = (n * sxy - sx * sy) / denom;
  const abs = Math.abs(slope);
  const direction: "up" | "down" | "stable" = abs < 0.05 ? "stable" : slope > 0 ? "up" : "down";
  const strength: "strong" | "moderate" | "weak" =
    abs >= 0.30 ? "strong" : abs >= 0.15 ? "moderate" : "weak";
  const adjMap = { weak: 0.05, moderate: 0.15, strong: 0.30 } as const;
  const adjustment =
    direction === "stable" ? 0 : (direction === "up" ? 1 : -1) * adjMap[strength];

  const descMap: Record<string, string> = {
    "stable-weak":   "최근 사정율이 안정적으로 유지되고 있습니다.",
    "up-weak":       "최근 사정율이 소폭 상승하는 추세입니다.",
    "up-moderate":   "최근 사정율이 완만하게 상승하는 추세입니다.",
    "up-strong":     "최근 사정율이 빠르게 상승하는 추세입니다.",
    "down-weak":     "최근 사정율이 소폭 하락하는 추세입니다.",
    "down-moderate": "최근 사정율이 완만하게 하락하는 추세입니다.",
    "down-strong":   "최근 사정율이 빠르게 하락하는 추세입니다.",
  };
  const description =
    descMap[`${direction}-${strength}`] ?? "최근 사정율이 안정적으로 유지되고 있습니다.";

  return { slope, direction, strength, adjustment, description };
}

// ─── 안정성 점수 ──────────────────────────────────────────────────────────────

export function calcStabilityScore(
  points: { sajung: number; deadline: string }[]
): number {
  if (points.length < 3) return 0.5;
  const vals = [...points]
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .slice(-10)
    .map(p => p.sajung);
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const std  = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
  return Math.max(0, Math.min(1, 1 - std / 2.0));
}

// ─── raw 데이터 포인트 조회 (BidResult + Announcement 조인) ──────────────────

async function _fetchPoints(
  orgName: string | null,
  category: string | string[],
  budgetRange: string,
  region: string
): Promise<{ sajung: number; deadline: string }[]> {
  const supabase = createAdminClient();
  const cats = Array.isArray(category) ? category : [category];

  let q = supabase
    .from("Announcement")
    .select("konepsId,budget,aValueAmt,deadline")
    .eq("region", region);
  if (cats.length === 1) {
    q = q.eq("category", cats[0]);
  } else {
    q = q.in("category", cats);
  }
  if (orgName) q = q.eq("orgName", orgName);
  const { data: anns } = await q.limit(300);

  const filtered = (anns ?? []).filter(
    a => { const aV = Number((a as Record<string, unknown>).aValueAmt); const b = aV > 0 ? aV : Number(a.budget) * 1.1; return classifyBudget(b) === budgetRange; }
  );
  const konepsIds = filtered.map(a => a.konepsId as string).filter(Boolean);
  if (konepsIds.length === 0) return [];

  const { data: bids } = await supabase
    .from("BidResult")
    .select("annId,bidRate,finalPrice")
    .in("annId", konepsIds)
    .limit(200);

  const annMap = new Map(filtered.map(a => [a.konepsId as string, a]));
  const points: { sajung: number; deadline: string }[] = [];

  for (const bid of (bids ?? [])) {
    const ann = annMap.get(bid.annId as string);
    if (!ann) continue;
    const bidRate    = Number(bid.bidRate);
    const finalPrice = Number(bid.finalPrice);
    const aValueAmtE = Number((ann as Record<string, unknown>).aValueAmt);
    const budget     = aValueAmtE > 0 ? aValueAmtE : Number(ann.budget) * 1.1;
    if (!bidRate || !finalPrice || !budget) continue;
    const sajung = (finalPrice / (bidRate / 100)) / budget * 100;
    if (sajung < 85 || sajung > 125) continue;
    points.push({ sajung, deadline: ann.deadline as string });
  }
  return points;
}

export async function queryRawDataPoints(
  orgName: string,
  category: string,
  budgetRange: string,
  region: string
): Promise<{ sajung: number; deadline: string }[]> {
  // 1단계: 발주처 + 정확한 업종
  const primary = await _fetchPoints(orgName, category, budgetRange, region);
  if (primary.length >= 30) return primary;

  // 2단계: 발주처 + 유사 업종 확장 (히스토그램과 동일 SIMILAR_CATEGORIES 활용)
  const similarCats = SIMILAR_CATEGORIES[category] ?? [];
  if (similarCats.length > 0) {
    const withSimilar = await _fetchPoints(orgName, [category, ...similarCats], budgetRange, region);
    if (withSimilar.length >= 30) return withSimilar;
    if (withSimilar.length >= 5) {
      // 유사 업종 포함 발주처 데이터 우선, 부족분만 ALL 업종으로 보충
      const fallback = await _fetchPoints(null, category, budgetRange, region);
      const supplement = fallback.filter(f => !withSimilar.some(p => p.deadline === f.deadline));
      return [...withSimilar, ...supplement.slice(0, Math.max(0, 30 - withSimilar.length))];
    }
  }

  // 3단계: ALL 업종 폴백 (기존 로직)
  const fallback = await _fetchPoints(null, category, budgetRange, region);
  if (primary.length >= 5) {
    const supplement = fallback.filter(f => !primary.some(p => p.deadline === f.deadline));
    return [...primary, ...supplement.slice(0, Math.max(0, 30 - primary.length))];
  }
  return fallback;
}

// ─── 최적 투찰가 예측 ─────────────────────────────────────────────────────────

export async function predictOptimalBid(params: {
  orgName: string;
  category: string;
  budget: number;        // 기초금액 (원)
  region: string;
  lowerLimitRate: number; // 낙찰하한율 % (예: 87.745)
  deadlineMonth: number;  // 1~12
  aValueTotal?: number;   // A값 합산 (원, A값 공고만. 없으면 0)
  // v2 선택 피처 (호출자 제공 시 ML 정확도 향상)
  deadlineDate?: string | Date;
  bsisAmt?: number;
  subCategories?: string[];
}): Promise<SajungPrediction> {
  const budgetRange = classifyBudget(params.budget);
  const orgName = params.orgName;
  let isFallback = false;

  // raw 데이터와 SajungRateStat 병렬 조회
  const [rawPoints, statPrimary] = await Promise.all([
    queryRawDataPoints(orgName, params.category, budgetRange, params.region),
    querySajungStat(orgName, params.category, budgetRange, params.region),
  ]);

  // 1. 발주처 특화 통계 조회 (region 일치 → region= 폴백)
  let stat = statPrimary;
  if (!stat && params.region) {
    stat = await querySajungStat(orgName, params.category, budgetRange, "");
  }

  // 2. sampleSize < 10 → ALL 카테고리 폴백 (region 일치 → region= 폴백)
  if (!stat || stat.sampleSize < 10) {
    stat = await querySajungStat("ALL", params.category, budgetRange, params.region);
    if ((!stat || stat.sampleSize < 5) && params.region) {
      stat = await querySajungStat("ALL", params.category, budgetRange, "");
    }
    isFallback = true;
  }

  // 2-a. stat이 sparse(< 30)하면 유사 업종 org stat과 먼저 블렌딩 (발주처 특성 우선 반영)
  let isBlended = false;
  if (stat && stat.sampleSize < 30 && !isFallback) {
    const similarCats = SIMILAR_CATEGORIES[params.category] ?? [];
    if (similarCats.length > 0) {
      const similarStats = (
        await Promise.all(
          similarCats.map(cat => querySajungStat(orgName, cat, budgetRange, params.region))
        )
      ).filter(Boolean) as SajungStatRow[];
      if (similarStats.length > 0) {
        const allStats = [stat, ...similarStats];
        const totalSamples = allStats.reduce((s, st) => s + st.sampleSize, 0);
        if (totalSamples >= 15) {
          stat = {
            ...stat,
            avg:    allStats.reduce((s, st) => s + st.avg    * st.sampleSize, 0) / totalSamples,
            stddev: allStats.reduce((s, st) => s + (st.stddev ?? 2) * st.sampleSize, 0) / totalSamples,
            p25:    allStats.reduce((s, st) => s + (st.p25 ?? 101) * st.sampleSize, 0) / totalSamples,
            p75:    allStats.reduce((s, st) => s + (st.p75 ?? 106) * st.sampleSize, 0) / totalSamples,
            sampleSize: stat.sampleSize, // 표시용 원래 건수 유지
          } as SajungStatRow;
          isBlended = true;
        }
      }
    }
  }

  // 2-b. stat이 여전히 sparse(< 30)하면 ALL 카테고리 stat과 비율 블렌딩
  if (stat && stat.sampleSize >= 5 && stat.sampleSize < 30 && !isBlended) {
    const allStat = await querySajungStat("ALL", params.category, budgetRange, params.region)
      ?? (params.region ? await querySajungStat("ALL", params.category, budgetRange, "") : null);
    if (allStat && allStat.sampleSize >= 30) {
      const w = stat.sampleSize / 30;
      stat = {
        ...allStat,
        avg:    stat.avg    * w + allStat.avg    * (1 - w),
        stddev: (stat.stddev ?? 2) * w + (allStat.stddev ?? 2) * (1 - w),
        p25:    (stat.p25 ?? allStat.p25 ?? 101) * w + (allStat.p25 ?? 101) * (1 - w),
        p75:    (stat.p75 ?? allStat.p75 ?? 106) * w + (allStat.p75 ?? 106) * (1 - w),
        sampleSize: stat.sampleSize, // 표시용 원래 건수 유지
      } as SajungStatRow;
      isBlended = true;
    }
  }

  // 3. budgetRange 무관 ALL 카테고리 폴백 (가장 샘플 많은 구간 사용)
  if (!stat || stat.sampleSize < 5) {
    const supabase = createAdminClient();
    const { data: anyData } = await supabase
      .from("SajungRateStat")
      .select("avg,stddev,p25,p50,p75,min,max,mode,monthlyAvg,sampleSize")
      .eq("orgName", "ALL")
      .eq("category", params.category)
      .eq("region", "")
      .order("sampleSize", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (anyData && (anyData as SajungStatRow).sampleSize >= 5) {
      stat = anyData as SajungStatRow;
    }
    isFallback = true;
  }

  // 시계열 메타 계산 (raw 데이터 기반)
  const hasRaw = rawPoints.length >= 5;
  const simpleAvg = hasRaw
    ? rawPoints.reduce((s, p) => s + p.sajung, 0) / rawPoints.length
    : (stat?.avg ?? 103.8);
  const weightedAvg  = hasRaw ? calcWeightedAvgSajung(rawPoints) : simpleAvg;
  const trendResult  = calcTrend(rawPoints);
  const stabilityScore = calcStabilityScore(rawPoints);
  const recentPoints = rawPoints.filter(
    p => Date.now() - new Date(p.deadline).getTime() < 365 * 24 * 60 * 60 * 1000
  );

  // 4. 전체 폴백도 없으면 기본값 (DB 전체 가중평균 기준: 103.8%)
  if (!stat || stat.sampleSize < 5) {
    const fallbackRate = 103.8;
    const estimated = params.budget * (fallbackRate / 100);
    const aValF = params.aValueTotal ?? 0;
    const lowerLimit = (estimated - aValF) * (params.lowerLimitRate / 100) + aValF;
    const rangeHighF = (estimated - aValF) * ((params.lowerLimitRate + 0.5) / 100) + aValF;
    return {
      predictedSajungRate: fallbackRate,
      sajungRateRange: { min: 97, max: 112, p25: 101, p75: 106 },
      sampleSize: 0,
      optimalBidPrice: Math.ceil(lowerLimit),
      bidPriceRangeLow: Math.ceil(lowerLimit),
      bidPriceRangeHigh: Math.ceil(rangeHighF),
      lowerLimitPrice: Math.ceil(lowerLimit),
      winProbability: 0.35,
      isFallback: true,
      confidenceLevel: "LOW" as ConfidenceLevel,
      modelVersion: "sajung-v1.0-default",
      weightedAvg: hasRaw ? Math.round(weightedAvg * 1000) / 1000 : fallbackRate,
      simpleAvg:   hasRaw ? Math.round(simpleAvg * 1000) / 1000 : fallbackRate,
      trend: rawPoints.length < 4
        ? { slope: 0, direction: "stable" as const, strength: "weak" as const, adjustment: 0, description: "데이터가 부족해 추세를 분석할 수 없습니다." }
        : trendResult,
      stabilityScore: Math.round(stabilityScore * 1000) / 1000,
      recentSampleSize: recentPoints.length,
    };
  }

  // 5. 예측 사정율 계산
  const monthKey = String(params.deadlineMonth);
  const monthAdj = (stat.monthlyAvg as Record<string, number>)[monthKey] ?? stat.avg;

  // 5-a. 통계 기반 예측 (기존 로직 유지 — ML 실패 시 폴백으로 사용)
  const statPred = hasRaw
    ? weightedAvg + trendResult.adjustment
    : stat.avg * 0.7 + monthAdj * 0.3;

  // 5-b. ML 예측 (LightGBM v2, 54 피처). 실패 시 null.
  const mlStddev = stat.stddev ?? 2;
  const month = params.deadlineMonth;
  const deadlineDate = new Date(params.deadlineDate ?? Date.now());
  // SajungRateStat 값을 v2 expanding mean 피처 프록시로 매핑
  // (실시간 expanding mean 계산은 DB 부담 → 이미 집계된 stat을 재활용)
  const mlPred = await fetchMlSajung({
    category: params.category,
    orgName: params.orgName,
    budgetRange,
    region: params.region || "전국",
    subcat_main: (params.subCategories?.[0] ?? ""),
    month,
    year: deadlineDate.getFullYear(),
    weekday: deadlineDate.getDay(),
    is_quarter_end: [3, 6, 9, 12].includes(month) ? 1 : 0,
    is_year_end: [11, 12].includes(month) ? 1 : 0,
    season_q: Math.ceil(month / 3),
    budget_log: Math.log(Math.max(1, params.budget)),
    numBidders: 25,
    stat_avg: stat.avg,
    stat_stddev: mlStddev,
    stat_p25: stat.p25 ?? 99,
    stat_p75: stat.p75 ?? 101,
    sampleSize: stat.sampleSize,
    bidder_volatility: stat.avg > 0 ? mlStddev / stat.avg : 0,
    is_sparse_org: stat.sampleSize < 30 ? 1 : 0,
    // v2 신규 (공고 본문 피처)
    aValueTotal_log: params.aValueTotal && params.aValueTotal > 0 ? Math.log(params.aValueTotal + 1) : 0,
    aValue_ratio: params.aValueTotal && params.budget > 0 ? params.aValueTotal / params.budget : 0,
    has_avalue: params.aValueTotal && params.aValueTotal > 0 ? 1 : 0,
    bsisAmt_log: params.bsisAmt && params.bsisAmt > 0 ? Math.log(params.bsisAmt) : 0,
    bsis_to_budget: params.bsisAmt && params.budget > 0 ? params.bsisAmt / params.budget : 0,
    lwltRate: params.lowerLimitRate ?? 87.745,
    // expanding mean 프록시: SajungRateStat 집계값 매핑
    org_past_mean: stat.avg,
    org_past_std: mlStddev,
    org_past_cnt: stat.sampleSize,
    orgcat_past_mean: stat.avg,
    orgcat_past_std: mlStddev,
    orgcat_past_cnt: stat.sampleSize,
    orgbud_past_mean: stat.avg,
    orgbud_past_std: mlStddev,
    orgbud_past_cnt: stat.sampleSize,
    // v3 신규 — 공고 시점에는 실제 개찰시간 미상이므로 deadline 기준 근사
    // (대다수 공고: deadline 익일 10시 KST 개찰)
    opened_month: month,
    opened_weekday: (deadlineDate.getDay() + 1) % 7,
    opened_hour: 10,
    opened_season_q: Math.ceil(month / 3),
    days_deadline_to_open: 1,
    is_morning_open: 1,
  });

  // 5-c. 앙상블: ML 성공 시 0.4×stat + 0.6×ML, 실패 시 통계 단독
  const predictedRate = mlPred !== null
    ? Math.max(85, Math.min(115, 0.4 * statPred + 0.6 * mlPred))
    : Math.max(85, Math.min(115, statPred));
  const usedMl = mlPred !== null;

  // 6. 투찰가 역산 — 표준 공식: ROUNDUP((예정가 - A) × 투찰률 + A)
  const estimated  = params.budget * (predictedRate / 100);
  const aVal       = params.aValueTotal ?? 0;
  const lowerLimit = (estimated - aVal) * (params.lowerLimitRate / 100) + aVal;
  const optimalBid = lowerLimit;  // 예측 사정률 정확 시 낙찰하한가 = 최적 투찰가
  const rangeLow   = lowerLimit;
  const rangeHigh  = (estimated - aVal) * ((params.lowerLimitRate + 0.5) / 100) + aVal;

  // 7. 몬테카를로 낙찰 확률
  const winProb = monteCarloWinProb(
    optimalBid, params.budget, predictedRate, stat.stddev, params.lowerLimitRate
  );

  return {
    predictedSajungRate: Math.round(predictedRate * 1000) / 1000,
    sajungRateRange: { min: stat.min ?? 97, max: stat.max ?? 112, p25: stat.p25 ?? 101, p75: stat.p75 ?? 106 },
    sampleSize: stat.sampleSize,
    optimalBidPrice: Math.ceil(optimalBid),
    bidPriceRangeLow: Math.ceil(rangeLow),
    bidPriceRangeHigh: Math.ceil(rangeHigh),
    lowerLimitPrice: Math.ceil(lowerLimit),
    winProbability: Math.round(winProb * 1000) / 1000,
    isFallback,
    confidenceLevel: getConfidenceLevel(
      stat.sampleSize, stat.stddev, recentPoints.length, stabilityScore, isBlended
    ),
    modelVersion: usedMl ? "sajung-v1.1+ml" : "sajung-v1.1",
    weightedAvg: Math.round(weightedAvg * 1000) / 1000,
    simpleAvg:   Math.round(simpleAvg * 1000) / 1000,
    trend:       trendResult,
    stabilityScore: Math.round(stabilityScore * 1000) / 1000,
    recentSampleSize: recentPoints.length,
  };
}

// ─── 경쟁 강도 분석 ───────────────────────────────────────────────────────────

export async function analyzeCompetition(params: {
  orgName: string;
  category: string;
  budget: number;
  region: string;
  deadlineMonth: number;
}): Promise<CompetitionResult> {
  const supabase = createAdminClient();
  const budgetRange = classifyBudget(params.budget);

  // Step 1: 유사 공고 konepsId 조회 (동일 발주처 OR 동일 카테고리+예산구간+지역)
  // BidResult.annId = konepsId 값이므로 Announcement에서 먼저 조회
  const { data: orgAnns } = await supabase
    .from("Announcement")
    .select("konepsId,budget")
    .eq("orgName", params.orgName)
    .limit(100);

  const { data: similarAnns } = await supabase
    .from("Announcement")
    .select("konepsId,budget")
    .eq("category", params.category)
    .eq("region", params.region)
    .limit(100);

  const konepsIds = Array.from(new Set([
    ...(orgAnns ?? []).map(a => a.konepsId as string),
    ...(similarAnns ?? [])
      .filter(a => classifyBudget(Number(a.budget)) === budgetRange)
      .map(a => a.konepsId as string),
  ])).filter(Boolean);

  type BidRow = { numBidders: number; winnerName: string | null; bidRate: string };
  let similar: BidRow[] = [];

  if (konepsIds.length > 0) {
    const { data: bids } = await supabase
      .from("BidResult")
      .select("numBidders,winnerName,bidRate")
      .in("annId", konepsIds)
      .not("numBidders", "is", null)
      .limit(200);
    similar = (bids as BidRow[] | null) ?? [];
  }

  if (similar.length === 0) {
    // 카테고리 전체 폴백: 동일 category 공고의 평균 참여자 수
    const { data: catAnns } = await supabase
      .from("Announcement")
      .select("konepsId")
      .eq("category", params.category)
      .limit(200);
    const catIds = (catAnns ?? []).map(a => a.konepsId as string).filter(Boolean);
    let expectedBidders: number | null = null;
    if (catIds.length > 0) {
      const { data: catBids } = await supabase
        .from("BidResult")
        .select("numBidders")
        .in("annId", catIds)
        .not("numBidders", "is", null)
        .limit(100);
      const nums = (catBids ?? []).map(r => (r as { numBidders: number }).numBidders).filter(n => n > 0);
      if (nums.length > 0) {
        expectedBidders = Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
      }
    }
    return {
      competitionScore: 50,
      scoreLevel: "보통",
      expectedBidders,
      dominantCompany: null,
      dominantWinRate: null,
      seasonEffect: false,
    };
  }

  // 예상 참여자 수
  const avgBidders = similar.reduce((s, r) => s + r.numBidders, 0) / similar.length;
  const expectedBidders = Math.round(avgBidders);

  // 낙찰률 변동성
  const rates = similar.map((r) => parseFloat(r.bidRate));
  const mean = rates.reduce((s, v) => s + v, 0) / rates.length;
  const variance = rates.reduce((s, v) => s + (v - mean) ** 2, 0) / rates.length;
  const volatility = Math.sqrt(variance);

  // 경쟁 강도 점수 (0~100)
  const baseScore = Math.min(100, expectedBidders * 5);
  const volScore  = volatility * 20;
  const seasonMultiplier = [3, 6, 9, 12].includes(params.deadlineMonth) ? 1.2 : 1.0;
  const rawScore = (baseScore + volScore) / 2;
  const score = Math.min(100, Math.round(rawScore * seasonMultiplier));

  // 독점 기업 분석
  const winnerCounts: Record<string, number> = {};
  for (const r of similar) {
    if (r.winnerName) {
      winnerCounts[r.winnerName] = (winnerCounts[r.winnerName] ?? 0) + 1;
    }
  }
  const entries = Object.entries(winnerCounts).sort((a, b) => b[1] - a[1]);
  const dominantCompany = entries[0]?.[0] ?? null;
  const dominantWinRate = dominantCompany
    ? Math.round((((entries[0]?.[1] ?? 0) / similar.length) * 1000)) / 1000
    : null;

  const scoreLevel: CompetitionResult["scoreLevel"] =
    score >= 75 ? "매우높음" : score >= 50 ? "높음" : score >= 25 ? "보통" : "낮음";

  return {
    competitionScore: score,
    scoreLevel,
    expectedBidders,
    dominantCompany,
    dominantWinRate,
    seasonEffect: seasonMultiplier > 1,
  };
}
