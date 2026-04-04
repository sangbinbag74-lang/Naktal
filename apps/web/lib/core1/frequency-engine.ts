/**
 * CORE 1 — 번호 역이용 엔진 (서버사이드 전용)
 *
 * 데이터 소스: NumberSelectionStat (category/budgetRange/region/bidderRange별 집계 캐시)
 * 폴백 체인: 조건 좁음 → 점진적으로 넓혀가며 재시도 → 통계 추정값
 */

import { createClient } from "@supabase/supabase-js";

export interface NumberCombo {
  numbers: number[];
  hitRate: number;      // 해당 번호들의 낙찰 점유율 (%, 소수점 1자리)
  freqMap: Record<number, number>; // 번호 1~15 → 빈도%
  zone: "low" | "mid" | "high";
}

export interface RecommendResult {
  combo1: NumberCombo;
  combo2: NumberCombo;
  combo3: NumberCombo;
  sampleSize: number;
  modelVersion: string;
  isEstimated: boolean;
}

// 공고 ID 기반 시드 생성 (결정론적)
function annSeed(annId: string): number {
  let h = 0x12345678;
  for (let i = 0; i < annId.length; i++) {
    h = Math.imul(h ^ annId.charCodeAt(i), 0x9e3779b9);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

// Mulberry32 PRNG
function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates 셔플 (in-place)
function shuffle<T>(arr: T[], rand: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// rateInt (투찰률 × 1000, 예: 87345) → millidigit (소수점 3자리, 예: 345)
function rateIntToMillidigit(rateInt: number): number {
  return rateInt % 1000;
}

// millidigit (0~999) → 번호 1~15 (균등 구간)
function millidigitToNum15(md: number): number {
  return Math.min(15, Math.floor((md * 15) / 1000) + 1);
}

// 빈도맵 → 해당 번호들의 낙찰 점유율 (%)
function calcHitRate(freqMap: Record<number, number>, numbers: number[], totalCount: number): number {
  if (totalCount === 0) return 0;
  const hits = numbers.reduce((s, n) => s + (freqMap[n] ?? 0), 0);
  return parseFloat(((hits / totalCount) * 100).toFixed(1));
}

// 통계 추정 기본값 (DB 데이터 부족 시)
function estimatedResult(): RecommendResult {
  const baseFreqMap: Record<number, number> = {};
  for (let i = 1; i <= 15; i++) {
    baseFreqMap[i] = (i % 5 === 0) ? 8.0 : 5.0;
  }
  const toCombo = (nums: number[], hitRate: number, zone: "low" | "mid" | "high"): NumberCombo => ({
    numbers: nums, hitRate, freqMap: baseFreqMap, zone,
  });
  return {
    combo1: toCombo([3, 7, 11], 14.2, "low"),
    combo2: toCombo([2, 8, 13], 11.8, "mid"),
    combo3: toCombo([4, 9, 14], 10.1, "high"),
    sampleSize: 0,
    modelVersion: "estimated-v1",
    isEstimated: true,
  };
}

// NumberSelectionStat 행들을 번호 1~15 빈도맵으로 변환
function buildNumFreqMap(rows: { rateInt: number; totalCount: number }[]): {
  numFreqMap: Record<number, number>;
  totalCount: number;
} {
  const numFreqMap: Record<number, number> = {};
  for (let i = 1; i <= 15; i++) numFreqMap[i] = 0;
  let totalCount = 0;

  for (const row of rows) {
    const md = rateIntToMillidigit(row.rateInt);
    const num = millidigitToNum15(md);
    numFreqMap[num] = (numFreqMap[num] ?? 0) + row.totalCount;
    totalCount += row.totalCount;
  }
  return { numFreqMap, totalCount };
}

function buildResult(
  numFreqMap: Record<number, number>,
  totalCount: number,
  bidderRange: string,
  matchLevel: string,
  annId: string,
): RecommendResult {
  const rand = mulberry32(annSeed(annId));

  // 빈도 → 비율(%) 변환 (프론트 히트맵용)
  const freqPctMap: Record<number, number> = {};
  for (const [k, v] of Object.entries(numFreqMap)) {
    freqPctMap[parseInt(k)] = parseFloat(((v / totalCount) * 100).toFixed(1));
  }

  // 번호를 빈도 낮은 순 정렬 → 하위 70% 추천 대상
  const sorted = Object.entries(numFreqMap)
    .map(([k, v]) => ({ num: parseInt(k), freq: v }))
    .sort((a, b) => a.freq - b.freq);

  const bottom = sorted.slice(0, Math.max(3, Math.floor(sorted.length * 0.7)));
  const third = Math.max(1, Math.floor(bottom.length / 3));

  // 각 존 내에서 공고 ID 기반 셔플 → 공고마다 다른 번호, 동일 공고는 항상 같은 번호
  const zone1 = shuffle(bottom.slice(0, third).map((x) => x.num), rand);
  const zone2 = shuffle(bottom.slice(third, third * 2).map((x) => x.num), rand);
  const zone3 = shuffle(bottom.slice(third * 2).map((x) => x.num), rand);

  const pick = (arr: number[], n = 3) => arr.slice(0, n);

  return {
    combo1: {
      numbers: pick(zone1),
      hitRate: calcHitRate(numFreqMap, pick(zone1), totalCount),
      freqMap: freqPctMap,
      zone: "low",
    },
    combo2: {
      numbers: pick(zone2),
      hitRate: calcHitRate(numFreqMap, pick(zone2), totalCount),
      freqMap: freqPctMap,
      zone: "mid",
    },
    combo3: {
      numbers: pick(zone3),
      hitRate: calcHitRate(numFreqMap, pick(zone3), totalCount),
      freqMap: freqPctMap,
      zone: "high",
    },
    sampleSize: totalCount,
    modelVersion: `stat-v1.${matchLevel}.${bidderRange}`,
    isEstimated: false,
  };
}

export interface RecommendParams {
  annId: string;
  category: string;
  budgetRange: string;
  region: string;
  estimatedBidders?: number;
  supabaseUrl: string;
  supabaseKey: string;
}

function classifyBidderRange(n?: number): string {
  if (!n) return "unknown";
  if (n <= 5) return "1-5";
  if (n <= 10) return "6-10";
  if (n <= 20) return "11-20";
  if (n <= 50) return "21-50";
  return "51+";
}

/**
 * CORE 1 번호 추천 메인 함수
 * NumberSelectionStat 캐시 테이블에서 조건별 빈도 분포를 조회해 저빈도 조합 추천.
 * 조건을 단계적으로 완화하며 충분한 샘플을 확보.
 */
export async function recommendNumbers(
  params: RecommendParams,
): Promise<RecommendResult> {
  const { supabaseUrl, supabaseKey, annId, category, budgetRange, region, estimatedBidders } = params;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const bidderRange = classifyBidderRange(estimatedBidders);
  const MIN_SAMPLE = 50;

  type StatRow = { rateInt: number; totalCount: number };

  async function queryStat(filter: Record<string, string>): Promise<StatRow[]> {
    let q = supabase.from("NumberSelectionStat").select("rateInt,totalCount").limit(2000);
    for (const [col, val] of Object.entries(filter)) {
      q = q.eq(col, val);
    }
    const { data } = await q;
    return (data ?? []) as StatRow[];
  }

  // 폴백 체인: 조건을 점진적으로 완화
  const catKey = category?.split(" ")[0] ?? "";

  const attempts: Array<{ filter: Record<string, string>; label: string }> = [
    // 1. 완전 일치 (category + budgetRange + region + bidderRange)
    { filter: { category: catKey, budgetRange, region, bidderRange }, label: "exact" },
    // 2. bidderRange 제외
    { filter: { category: catKey, budgetRange, region }, label: "no-bidder" },
    // 3. region 제외
    { filter: { category: catKey, budgetRange }, label: "no-region" },
    // 4. budgetRange 제외
    { filter: { category: catKey }, label: "cat-only" },
    // 5. budgetRange만
    { filter: { budgetRange }, label: "budget-only" },
    // 6. 전체 (필터 없음)
    { filter: {}, label: "global" },
  ];

  for (const { filter, label } of attempts) {
    const rows = await queryStat(filter);
    const { numFreqMap, totalCount } = buildNumFreqMap(rows);
    if (totalCount >= MIN_SAMPLE) {
      return buildResult(numFreqMap, totalCount, bidderRange, label, annId);
    }
  }

  // 모든 시도 실패 → 통계 추정값
  return estimatedResult();
}
