/**
 * CORE 1: 사정율 기반 최적 투찰가 예측 + 경쟁 강도 분석
 *
 * 사정율 = 예정가격 ÷ 기초금액 × 100
 * 예정가격 = 낙찰금액 ÷ (낙찰률 ÷ 100)
 * 유효 범위: 97~103%
 */

import { createAdminClient } from "@/lib/supabase/server";
import { extractCoreOrgName } from "@/lib/analysis/sajung-utils";

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
  stabilityScore: number
): ConfidenceLevel {
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

export async function queryRawDataPoints(
  orgName: string,
  category: string,
  budgetRange: string,
  region: string
): Promise<{ sajung: number; deadline: string }[]> {
  const supabase = createAdminClient();

  const { data: anns } = await supabase
    .from("Announcement")
    .select("konepsId,budget,rawJson->>bdgtAmt,deadline")
    .eq("orgName", orgName)
    .eq("category", category)
    .eq("region", region)
    .limit(200);

  const filtered = (anns ?? []).filter(
    a => { const raw = Number((a as Record<string, unknown>).bdgtAmt); const b = raw > 0 ? raw : Number(a.budget) * 1.1; return classifyBudget(b) === budgetRange; }
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
    const bdgtAmt    = Number((ann as Record<string, unknown>).bdgtAmt);
    const budget     = bdgtAmt > 0 ? bdgtAmt : Number(ann.budget) * 1.1;
    if (!bidRate || !finalPrice || !budget) continue;
    const sajung = (finalPrice / (bidRate / 100)) / budget * 100;
    if (sajung < 85 || sajung > 125) continue;
    points.push({ sajung, deadline: ann.deadline as string });
  }
  return points;
}

// ─── 최적 투찰가 예측 ─────────────────────────────────────────────────────────

export async function predictOptimalBid(params: {
  orgName: string;
  category: string;
  budget: number;        // 기초금액 (원)
  region: string;
  lowerLimitRate: number; // 낙찰하한율 % (예: 87.745)
  deadlineMonth: number;  // 1~12
}): Promise<SajungPrediction> {
  const budgetRange = classifyBudget(params.budget);
  const orgName = extractCoreOrgName(params.orgName); // "전북특별자치도 익산시" → "익산시"
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
    const lowerLimit = estimated * (params.lowerLimitRate / 100);
    return {
      predictedSajungRate: fallbackRate,
      sajungRateRange: { min: 97, max: 112, p25: 101, p75: 106 },
      sampleSize: 0,
      optimalBidPrice: Math.round(estimated * 0.9997),
      bidPriceRangeLow: Math.round(Math.max(lowerLimit, estimated * 0.998)),
      bidPriceRangeHigh: Math.round(estimated * 0.9997),
      lowerLimitPrice: Math.round(lowerLimit),
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

  // raw 충분 시: 가중평균 + 추세 조정 / 아니면 기존 시즌 가중 방식
  const predictedRate = hasRaw
    ? Math.max(85, Math.min(115, weightedAvg + trendResult.adjustment))
    : stat.avg * 0.7 + monthAdj * 0.3;

  // 6. 투찰가 역산
  const estimated  = params.budget * (predictedRate / 100);
  const lowerLimit = estimated * (params.lowerLimitRate / 100);
  const optimalBid = estimated * 0.9997;
  const rangeLow   = Math.max(lowerLimit, estimated * 0.998);
  const rangeHigh  = optimalBid;

  // 7. 몬테카를로 낙찰 확률
  const winProb = monteCarloWinProb(
    optimalBid, params.budget, predictedRate, stat.stddev, params.lowerLimitRate
  );

  return {
    predictedSajungRate: Math.round(predictedRate * 100) / 100,
    sajungRateRange: { min: stat.min ?? 97, max: stat.max ?? 112, p25: stat.p25 ?? 101, p75: stat.p75 ?? 106 },
    sampleSize: stat.sampleSize,
    optimalBidPrice: Math.round(optimalBid),
    bidPriceRangeLow: Math.round(rangeLow),
    bidPriceRangeHigh: Math.round(rangeHigh),
    lowerLimitPrice: Math.round(lowerLimit),
    winProbability: Math.round(winProb * 1000) / 1000,
    isFallback,
    confidenceLevel: getConfidenceLevel(
      stat.sampleSize, stat.stddev, recentPoints.length, stabilityScore
    ),
    modelVersion: "sajung-v1.1",
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
