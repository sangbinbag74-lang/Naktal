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
import { fetchMlSajung, fetchMlEnsemble } from "./ml-client";
import {
  classifyCategory,
  SAJUNG_FILTER_BY_KIND,
  DEFAULT_SAJUNG_BY_KIND,
  DEFAULT_LWLT_BY_KIND,
} from "@/lib/analysis/category-config";

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
  // F15 (박상빈님 5/18) — 자동 확장 및 분석 메타 영구 보관
  originalSampleSize: number;  // 발주처 통계 원본 (확장 전 stat.sampleSize)
  blendedSampleSize: number;   // ALL blend 적용 후 총 표본 (확장 후)
  isBlended: boolean;          // 자동 확장 적용 여부
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
  numBidders = 30, // 예상 참여자 수 (기본 30명)
  n = 5000
): number {
  let totalWinProb = 0;
  for (let i = 0; i < n; i++) {
    const simSajung = normalRandom(sajungMean, sajungStd);
    const simPrice  = budget * (simSajung / 100);
    const simLower  = simPrice * (lowerLimitRate / 100);

    // 1. 사용자 투찰가가 낙찰하한가 미만 = 무효
    if (myBid < simLower) continue;

    // 2. 다른 회사 (numBidders-1 명) 가 더 낮은 투찰가일 확률 (균등분포 가정)
    //    — 다른 회사들도 낙찰하한가 ~ 예정가 사이에 균등 분포
    //    - p = (myBid - simLower) / (simPrice - simLower) — 한 명이 사용자보다 낮을 확률
    //    - 사용자가 가장 낮음 = (1-p)^(numBidders-1)
    const range = simPrice - simLower;
    const p = range > 0 ? Math.min(1, Math.max(0, (myBid - simLower) / range)) : 0;
    const myWinProb = Math.pow(1 - p, Math.max(0, numBidders - 1));
    totalWinProb += myWinProb;
  }
  return totalWinProb / n;
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

/** orgName 의 첫 2 토큰 (도 + 시·군) — '경상북도 봉화군 체육시설사업소' → '경상북도 봉화군' */
function extractParentOrgName(orgName: string): string | null {
  const tokens = (orgName ?? "").trim().split(/\s+/);
  if (tokens.length < 2) return null;
  return `${tokens[0]} ${tokens[1]}`;
}

/** orgName 의 첫 1 토큰 (광역시·도) — '서울특별시 중구' → '서울특별시' */
function extractTopOrgName(orgName: string): string | null {
  const tokens = (orgName ?? "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 1) return null;
  return tokens[0] ?? null;
}

/** 부모 발주처(시·군) ILIKE 매칭 — 산하기관 합산 (가중 평균) */
async function querySajungStatByParentOrg(
  parentOrg: string,
  category: string,
  budgetRange: string,
  region: string
): Promise<SajungStatRow | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("SajungRateStat")
    .select("avg,stddev,p25,p50,p75,min,max,mode,monthlyAvg,sampleSize")
    .ilike("orgName", `${parentOrg}%`)
    .eq("category", category)
    .eq("budgetRange", budgetRange)
    .eq("region", region);
  if (!data || data.length === 0) return null;
  const rows = data as SajungStatRow[];
  const total = rows.reduce((s, r) => s + (r.sampleSize ?? 0), 0);
  if (total === 0) return null;
  return {
    avg:        rows.reduce((s, r) => s + r.avg * (r.sampleSize ?? 0), 0) / total,
    stddev:     rows.reduce((s, r) => s + (r.stddev ?? 2) * (r.sampleSize ?? 0), 0) / total,
    p25:        rows.reduce((s, r) => s + (r.p25 ?? 99)  * (r.sampleSize ?? 0), 0) / total,
    p50:        rows.reduce((s, r) => s + (r.p50 ?? 100) * (r.sampleSize ?? 0), 0) / total,
    p75:        rows.reduce((s, r) => s + (r.p75 ?? 101) * (r.sampleSize ?? 0), 0) / total,
    min:        Math.min(...rows.map(r => r.min ?? 97)),
    max:        Math.max(...rows.map(r => r.max ?? 103)),
    mode:       rows[0]?.mode ?? 100,
    monthlyAvg: rows[0]?.monthlyAvg ?? {},
    sampleSize: total,
  } as SajungStatRow;
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
    .select("konepsId,budget,bsisAmt,aValueAmt,deadline")
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
  // 카테고리별 사정율 유효 범위 (cats 의 첫번째 사용 — 단일 카테고리 호출 가정)
  const filterRange = SAJUNG_FILTER_BY_KIND[classifyCategory(cats[0])];

  for (const bid of (bids ?? [])) {
    const ann = annMap.get(bid.annId as string);
    if (!ann) continue;
    const bidRate    = Number(bid.bidRate);
    const finalPrice = Number(bid.finalPrice);
    // base = bsisAmt(기초금액) 우선 > aValueAmt > budget×1.1
    const bsisE = Number((ann as Record<string, unknown>).bsisAmt);
    const aValueAmtE = Number((ann as Record<string, unknown>).aValueAmt);
    const base = bsisE > 0 ? bsisE : aValueAmtE > 0 ? aValueAmtE : Number(ann.budget) * 1.1;
    if (!bidRate || !finalPrice || !base) continue;
    const sajung = (finalPrice / (bidRate / 100)) / base * 100;
    if (sajung < filterRange.min || sajung > filterRange.max) continue;
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
  lowerLimitRate: number; // 낙찰하한율 % (예: 89.745, 공사 2026-01-30 ↑)
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

  // 1-a. 발주처 정확 매칭 0/sparse → 부모 발주처(시·군) ILIKE 확장
  //   예: '경상북도 봉화군 체육시설사업소' 0건 → '경상북도 봉화군' 산하 모든 기관 합산
  if (!stat || stat.sampleSize < 5) {
    const parentOrg = extractParentOrgName(orgName);
    if (parentOrg) {
      let parentStat = await querySajungStatByParentOrg(parentOrg, params.category, budgetRange, params.region);
      if ((!parentStat || parentStat.sampleSize < 5) && params.region) {
        parentStat = await querySajungStatByParentOrg(parentOrg, params.category, budgetRange, "");
      }
      if (parentStat && parentStat.sampleSize >= 5) {
        stat = parentStat;
        // 확장 매칭이지만 부모 시·군 단위 통계는 의미 있는 분석으로 간주 (isFallback=false 유지)
      }
    }
  }

  // 1-b. 시·군 단위도 0/sparse → 광역시·도 단위 ILIKE 확장
  //   예: '서울특별시 중구' 0건 → '서울특별시' 산하 모든 기관 합산
  if (!stat || stat.sampleSize < 5) {
    const topOrg = extractTopOrgName(orgName);
    if (topOrg) {
      let topStat = await querySajungStatByParentOrg(topOrg, params.category, budgetRange, params.region);
      if ((!topStat || topStat.sampleSize < 5) && params.region) {
        topStat = await querySajungStatByParentOrg(topOrg, params.category, budgetRange, "");
      }
      if (topStat && topStat.sampleSize >= 5) {
        stat = topStat;
      }
    }
  }

  // 2. 위 단계도 sparse → ALL 카테고리 폴백 (region 일치 → region= 폴백)
  if (!stat || stat.sampleSize < 10) {
    stat = await querySajungStat("ALL", params.category, budgetRange, params.region);
    if ((!stat || stat.sampleSize < 5) && params.region) {
      stat = await querySajungStat("ALL", params.category, budgetRange, "");
    }
    isFallback = true;
  }

  // F15 (박상빈님 5/18): 확장 전 원본 표본수 저장 (자동 확장 사실 가시화용)
  // 원본 = 발주처+region+카테고리+예산구간 정확 매칭 (statPrimary). 확장 후 = blend 표본.
  const originalSampleSize = statPrimary?.sampleSize ?? 0;
  let blendedSampleSize = stat?.sampleSize ?? 0;
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
        blendedSampleSize = totalSamples;
        if (totalSamples >= 15) {
          // 카테고리별 default p25/p75 (공사 99/101 / 용역 80/95 / 물품 70/92)
          const sd = DEFAULT_SAJUNG_BY_KIND[classifyCategory(params.category)];
          stat = {
            ...stat,
            avg:    allStats.reduce((s, st) => s + st.avg    * st.sampleSize, 0) / totalSamples,
            stddev: allStats.reduce((s, st) => s + (st.stddev ?? 2) * st.sampleSize, 0) / totalSamples,
            p25:    allStats.reduce((s, st) => s + (st.p25 ?? sd.p25) * st.sampleSize, 0) / totalSamples,
            p75:    allStats.reduce((s, st) => s + (st.p75 ?? sd.p75) * st.sampleSize, 0) / totalSamples,
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
      blendedSampleSize = stat.sampleSize + allStat.sampleSize;
      const w = stat.sampleSize / 30;
      // 카테고리별 default p25/p75
      const sd = DEFAULT_SAJUNG_BY_KIND[classifyCategory(params.category)];
      stat = {
        ...allStat,
        avg:    stat.avg    * w + allStat.avg    * (1 - w),
        stddev: (stat.stddev ?? 2) * w + (allStat.stddev ?? 2) * (1 - w),
        p25:    (stat.p25 ?? allStat.p25 ?? sd.p25) * w + (allStat.p25 ?? sd.p25) * (1 - w),
        p75:    (stat.p75 ?? allStat.p75 ?? sd.p75) * w + (allStat.p75 ?? sd.p75) * (1 - w),
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

  // 3-b. (신규) 카테고리 전체 가중평균 폴백 — ALL row 자체가 없을 때 (region 비정상 등)
  //      모든 발주처·예산구간·지역 통합. 박상빈님 천안골프장 케이스 대응.
  if (!stat || stat.sampleSize < 5) {
    const supabase = createAdminClient();
    const { data: catRows } = await supabase
      .from("SajungRateStat")
      .select("avg,stddev,p25,p50,p75,min,max,mode,monthlyAvg,sampleSize")
      .eq("category", params.category)
      .gt("sampleSize", 0)
      .order("sampleSize", { ascending: false })
      .limit(5000);
    const rows = (catRows ?? []) as SajungStatRow[];
    const totalN = rows.reduce((s, r) => s + Number(r.sampleSize ?? 0), 0);
    if (totalN >= 5) {
      // 샘플 크기 가중 평균 계산
      const wAvg = (key: keyof SajungStatRow) =>
        rows.reduce((s, r) => s + Number(r[key] ?? 0) * Number(r.sampleSize ?? 0), 0) / totalN;
      // monthlyAvg 는 객체 — 간단히 첫 row 사용
      const firstMonthly = rows[0]?.monthlyAvg ?? {};
      stat = {
        avg:    wAvg("avg"),
        stddev: wAvg("stddev"),
        p25:    wAvg("p25"),
        p50:    wAvg("p50"),
        p75:    wAvg("p75"),
        min:    Math.min(...rows.map(r => Number(r.min ?? 0)).filter(v => v > 0)) || wAvg("p25"),
        max:    Math.max(...rows.map(r => Number(r.max ?? 0))) || wAvg("p75"),
        mode:   wAvg("mode") || wAvg("avg"),
        monthlyAvg: firstMonthly as Record<string, number>,
        sampleSize: totalN,
      } as SajungStatRow;
    }
    isFallback = true;
  }

  // 시계열 메타 계산 (raw 데이터 기반)
  const hasRaw = rawPoints.length >= 5;
  const _sd = DEFAULT_SAJUNG_BY_KIND[classifyCategory(params.category)];
  const simpleAvg = hasRaw
    ? rawPoints.reduce((s, p) => s + p.sajung, 0) / rawPoints.length
    : (stat?.avg ?? _sd.center);
  const weightedAvg  = hasRaw ? calcWeightedAvgSajung(rawPoints) : simpleAvg;
  const trendResult  = calcTrend(rawPoints);
  const stabilityScore = calcStabilityScore(rawPoints);
  const recentPoints = rawPoints.filter(
    p => Date.now() - new Date(p.deadline).getTime() < 365 * 24 * 60 * 60 * 1000
  );

  // 4. 전체 폴백도 없으면 카테고리별 기본값 사용
  //    (공사 100 / 용역 87 / 물품 80 — DEFAULT_SAJUNG_BY_KIND)
  if (!stat || stat.sampleSize < 5) {
    const sd = DEFAULT_SAJUNG_BY_KIND[classifyCategory(params.category)];
    const fallbackRate = sd.center;
    const aValF = params.aValueTotal ?? 0;
    const lwltF = params.lowerLimitRate / 100;
    // 박상빈님 지시 (2026-05-17): 안전마진 + Hard clamp 모두 제거. 예측 사정율 그대로 사용.
    const estimatedF      = params.budget * (fallbackRate / 100);
    const estimatedFLow   = params.budget * (fallbackRate / 100);
    const estimatedFHigh  = params.budget * (fallbackRate / 100);
    const optimalBidF = Math.ceil((estimatedF     - aValF) * lwltF + aValF);
    const rangeLowF   = Math.ceil((estimatedFLow  - aValF) * lwltF + aValF);
    const rangeHighF  = Math.ceil((estimatedFHigh - aValF) * lwltF + aValF);
    // UI 표시용 참조 가격 (사정율 100% 기준) — 진짜 낙찰하한가 아님
    const realLowerF = Math.ceil((params.budget - aValF) * lwltF + aValF);
    return {
      predictedSajungRate: fallbackRate,
      sajungRateRange: { min: sd.min, max: sd.max, p25: sd.p25, p75: sd.p75 },
      sampleSize: 0,
      optimalBidPrice: Math.ceil(optimalBidF),
      bidPriceRangeLow: Math.ceil(rangeLowF),
      bidPriceRangeHigh: Math.ceil(rangeHighF),
      lowerLimitPrice: Math.ceil(realLowerF),
      winProbability: 0, // 0 = 데이터 부족 (UI 에서 "-" 표시)
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
      // F15 — fallback path 도 동일 메타 유지
      originalSampleSize,
      blendedSampleSize,
      isBlended: false,
    };
  }

  // 5. 예측 사정율 계산
  const monthKey = String(params.deadlineMonth);
  const monthAdj = (stat.monthlyAvg as Record<string, number>)[monthKey] ?? stat.avg;

  // 5-a. 통계 기반 예측 (기존 로직 유지 — ML 실패 시 폴백으로 사용)
  const statPred = hasRaw
    ? weightedAvg + trendResult.adjustment
    : stat.avg * 0.7 + monthAdj * 0.3;

  // 5-b. ML 예측 (LightGBM v2+tuned, 54 피처). 실패 시 null.
  const mlStddev = stat.stddev ?? 2;
  const month = params.deadlineMonth;
  const deadlineDate = new Date(params.deadlineDate ?? Date.now());
  // SajungRateStat 값을 v2 expanding mean 피처 프록시로 매핑
  const mlFeatures = {
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
    stat_p25: stat.p25 ?? DEFAULT_SAJUNG_BY_KIND[classifyCategory(params.category)].p25,
    stat_p75: stat.p75 ?? DEFAULT_SAJUNG_BY_KIND[classifyCategory(params.category)].p75,
    sampleSize: stat.sampleSize,
    bidder_volatility: stat.avg > 0 ? mlStddev / stat.avg : 0,
    is_sparse_org: stat.sampleSize < 30 ? 1 : 0,
    aValueTotal_log: params.aValueTotal && params.aValueTotal > 0 ? Math.log(params.aValueTotal + 1) : 0,
    aValue_ratio: params.aValueTotal && params.budget > 0 ? params.aValueTotal / params.budget : 0,
    has_avalue: params.aValueTotal && params.aValueTotal > 0 ? 1 : 0,
    bsisAmt_log: params.bsisAmt && params.bsisAmt > 0 ? Math.log(params.bsisAmt) : 0,
    bsis_to_budget: params.bsisAmt && params.budget > 0 ? params.bsisAmt / params.budget : 0,
    lwltRate: params.lowerLimitRate ?? DEFAULT_LWLT_BY_KIND[classifyCategory(params.category)],
    org_past_mean: stat.avg,
    org_past_std: mlStddev,
    org_past_cnt: stat.sampleSize,
    orgcat_past_mean: stat.avg,
    orgcat_past_std: mlStddev,
    orgcat_past_cnt: stat.sampleSize,
    orgbud_past_mean: stat.avg,
    orgbud_past_std: mlStddev,
    orgbud_past_cnt: stat.sampleSize,
    opened_month: month,
    opened_weekday: (deadlineDate.getDay() + 1) % 7,
    opened_hour: 10,
    opened_season_q: Math.ceil(month / 3),
    days_deadline_to_open: 1,
    is_morning_open: 1,
  };

  // 5-b-1. Ensemble (Phase 2+3+4) 우선 시도 — recommended_sajung_rate = 메타 q95 (적격 95% 보장)
  // 실패 시 v2+tuned 단독으로 폴백 → 그것도 실패 시 통계 단독
  const ensemblePred = await fetchMlEnsemble(mlFeatures);
  const mlPred = ensemblePred
    ? ensemblePred.recommended_sajung_rate
    : await fetchMlSajung(mlFeatures);
  const usedEnsemble = ensemblePred !== null;

  // 5-c. 사정율 예측 통합
  // - Ensemble 성공 시: recommended_sajung_rate (메타 q95) 그대로 사용 → 이미 안전 quantile 적용된 값
  //   → 아래 6단계의 σ × z 추가 안전선은 중복 적용이 되므로 z=0 으로 우회 (effStddev × 0)
  // - Ensemble 실패 + v2+tuned 성공: 0.4 × stat + 0.6 × ML 앙상블 (기존 로직)
  //   → 아래 6단계 σ × z 안전선 정상 적용
  // - 둘 다 실패: 통계 단독 + σ × z
  const predictedRate = usedEnsemble && mlPred !== null
    ? Math.max(85, Math.min(115, mlPred))
    : mlPred !== null
      ? Math.max(85, Math.min(115, 0.4 * statPred + 0.6 * mlPred))
      : Math.max(85, Math.min(115, statPred));
  const usedMl = mlPred !== null;

  // 6. 투찰가 역산 — 박상빈님 지시 (2026-05-17): Hard clamp 완전 제거
  //
  // 박상빈님 5/17 명시:
  //   "사정율 100% ≠ 낙찰하한가" — realLowerLimit (사정율 100% 가정) 자체가 잘못된 개념.
  //   진짜 낙찰하한가 = G2B 가 정한 진짜 사정율 × bsisAmt × 낙찰하한율 (사후만 확인 가능).
  //   = Hard clamp 완전 제거.
  //
  // - σ × z 안전 quantile 제거 — AI 예측 사정율 그대로 사용
  // - Hard clamp 제거 — AI 예측 그대로
  // - optimalBid = (predictedRate × budget - A) × lwlt + A (점 추정)
  // - 4개 값 (사정율·예정가·추천금액·참조하한) 모두 같은 사정율 기준 → G2B 검증 가능
  const aVal       = params.aValueTotal ?? 0;
  const lwlt       = params.lowerLimitRate / 100;

  const estimated      = params.budget * (predictedRate / 100);
  const estimatedLow   = params.budget * (predictedRate / 100);
  const estimatedHigh  = params.budget * (predictedRate / 100);
  const optimalBid     = Math.ceil((estimated     - aVal) * lwlt + aVal);
  const rangeLow       = Math.ceil((estimatedLow  - aVal) * lwlt + aVal);
  const rangeHigh      = Math.ceil((estimatedHigh - aVal) * lwlt + aVal);

  // UI 표시용 참조 가격 (사정율 100% 기준) — 진짜 낙찰하한가 아님 (G2B 사후만 확인 가능)
  const lowerLimit = Math.ceil((params.budget - aVal) * lwlt + aVal);

  // 7. 몬테카를로 낙찰 확률 (다른 회사 분포 포함)
  // numBidders 가 인자에 없으면 30명 기본 (한국 공공조달 평균)
  const winProb = monteCarloWinProb(
    optimalBid, params.budget, predictedRate, stat.stddev, params.lowerLimitRate, 30
  );

  // 카테고리별 사정율 default (공사 99~101 / 용역 80~95 / 물품 70~92)
  const sajungDef = DEFAULT_SAJUNG_BY_KIND[classifyCategory(params.category)];
  return {
    predictedSajungRate: Math.round(predictedRate * 1000) / 1000,
    sajungRateRange: {
      min: stat.min ?? sajungDef.min,
      max: stat.max ?? sajungDef.max,
      p25: stat.p25 ?? sajungDef.p25,
      p75: stat.p75 ?? sajungDef.p75,
    },
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
    modelVersion: usedEnsemble
      ? "ensemble-v5.0-2026-05-19[B-q70+M1]"  // 박상빈님 5/19 명시 — 0.5×B-q70 + 0.5×M1(5way) (noise X, 부적격 34.55% / 1위 5.04% / 점수 3.315 1위)
      : usedMl
        ? "sajung-v2-only-ml-2026-05-18"  // tuned(5/02 옛 1.16M) 차단, v2(1.84M) 단독
        : "sajung-stat",  // ML 둘 다 실패 시 통계 단독
    weightedAvg: Math.round(weightedAvg * 1000) / 1000,
    simpleAvg:   Math.round(simpleAvg * 1000) / 1000,
    trend:       trendResult,
    stabilityScore: Math.round(stabilityScore * 1000) / 1000,
    recentSampleSize: recentPoints.length,
    // F15 (박상빈님 5/18) — 자동 확장 메타
    originalSampleSize,
    blendedSampleSize,
    isBlended,
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
