/**
 * CORE 1: 사정율 기반 최적 투찰가 예측 + 경쟁 강도 분석
 *
 * 사정율 = 예정가격 ÷ 기초금액 × 100
 * 예정가격 = 낙찰금액 ÷ (낙찰률 ÷ 100)
 * 유효 범위: 97~103%
 */

import { createAdminClient } from "@/lib/supabase/server";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

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
  modelVersion: string;
}

export interface CompetitionResult {
  competitionScore: number;      // 0~100
  scoreLevel: "낮음" | "보통" | "높음" | "매우높음";
  expectedBidders: number;
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
  let isFallback = false;

  // 1. 발주처 특화 통계 조회
  let stat = await querySajungStat(
    params.orgName, params.category, budgetRange, params.region
  );

  // 2. sampleSize < 10 → 카테고리 전체 폴백
  if (!stat || stat.sampleSize < 10) {
    stat = await querySajungStat("ALL", params.category, budgetRange, params.region);
    isFallback = true;
  }

  // 3. 전체 폴백도 없으면 기본값 (업계 일반 추정)
  if (!stat || stat.sampleSize < 5) {
    const fallbackRate = 98.5;
    const estimated = params.budget * (fallbackRate / 100);
    const lowerLimit = estimated * (params.lowerLimitRate / 100);
    return {
      predictedSajungRate: fallbackRate,
      sajungRateRange: { min: 97, max: 103, p25: 98, p75: 99.5 },
      sampleSize: 0,
      optimalBidPrice: Math.round(estimated * 0.9997),
      bidPriceRangeLow: Math.round(Math.max(lowerLimit, estimated * 0.998)),
      bidPriceRangeHigh: Math.round(estimated * 0.9997),
      lowerLimitPrice: Math.round(lowerLimit),
      winProbability: 0.35,
      isFallback: true,
      modelVersion: "sajung-v1.0-default",
    };
  }

  // 4. 시즌 가중 예측율
  const monthKey = String(params.deadlineMonth);
  const monthAdj = (stat.monthlyAvg as Record<string, number>)[monthKey] ?? stat.avg;
  const predictedRate = stat.avg * 0.7 + monthAdj * 0.3;

  // 5. 투찰가 역산
  const estimated  = params.budget * (predictedRate / 100);
  const lowerLimit = estimated * (params.lowerLimitRate / 100);
  const optimalBid = estimated * 0.9997;
  const rangeLow   = Math.max(lowerLimit, estimated * 0.998);
  const rangeHigh  = optimalBid;

  // 6. 몬테카를로 낙찰 확률
  const winProb = monteCarloWinProb(
    optimalBid, params.budget, predictedRate, stat.stddev, params.lowerLimitRate
  );

  return {
    predictedSajungRate: Math.round(predictedRate * 100) / 100,
    sajungRateRange: { min: stat.min, max: stat.max, p25: stat.p25, p75: stat.p75 },
    sampleSize: stat.sampleSize,
    optimalBidPrice: Math.round(optimalBid),
    bidPriceRangeLow: Math.round(rangeLow),
    bidPriceRangeHigh: Math.round(rangeHigh),
    lowerLimitPrice: Math.round(lowerLimit),
    winProbability: Math.round(winProb * 1000) / 1000,
    isFallback,
    modelVersion: "sajung-v1.0",
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

  // 유사 낙찰 결과 조회 (동일 발주처 OR 동일 카테고리+예산구간+지역)
  const { data: bidResults } = await supabase
    .from("BidResult")
    .select("numBidders,winnerName,bidRate,Announcement!annId(orgName,category,region,budget)")
    .not("numBidders", "is", null)
    .limit(200);

  type BidRow = {
    numBidders: number;
    winnerName: string | null;
    bidRate: string;
    Announcement: { orgName: string; category: string; region: string; budget: string } | null;
  };

  const rows = (bidResults as BidRow[] | null) ?? [];

  // 유사 공고 필터 (발주처 일치 OR 카테고리+예산+지역 일치)
  const similar = rows.filter((r) => {
    const ann = r.Announcement;
    if (!ann) return false;
    if (ann.orgName === params.orgName) return true;
    const br = classifyBudget(Number(ann.budget));
    return ann.category === params.category && br === budgetRange && ann.region === params.region;
  });

  if (similar.length === 0) {
    return {
      competitionScore: 50,
      scoreLevel: "보통",
      expectedBidders: 10,
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
