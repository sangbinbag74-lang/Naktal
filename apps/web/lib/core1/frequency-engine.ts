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
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
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

// 통계 추정 기본값 (DB 데이터 부족 시) — annId 시드로 공고마다 다른 번호 반환
function estimatedResult(annId: string): RecommendResult {
  const rand = mulberry32(annSeed(annId));
  const nums = Array.from({ length: 15 }, (_, i) => i + 1);
  shuffle(nums, rand);
  const baseFreqMap: Record<number, number> = {};
  for (let i = 1; i <= 15; i++) baseFreqMap[i] = 6.7;
  const toCombo = (ns: number[], zone: "low" | "mid" | "high"): NumberCombo => ({
    numbers: ns, hitRate: 20.0, freqMap: baseFreqMap, zone,
  });
  return {
    combo1: toCombo(nums.slice(0, 3), "low"),
    combo2: toCombo(nums.slice(3, 6), "mid"),
    combo3: toCombo(nums.slice(6, 9), "high"),
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

  // 빈도 낮은 순 정렬
  const sorted = Object.entries(numFreqMap)
    .map(([k, v]) => ({ num: parseInt(k), freq: v }))
    .sort((a, b) => a.freq - b.freq);

  // 가중치 기반 비복원 추출 (낮은 빈도 = 높은 가중치)
  // → 같은 "저빈도 9개"를 순서만 바꾸는 게 아니라, annId마다 뽑히는 숫자 자체가 달라짐
  const pool = sorted.map((x) => ({ num: x.num, weight: 1 / (x.freq + 1) }));
  const picks: number[] = [];

  for (let i = 0; i < 9 && pool.length > 0; i++) {
    const total = pool.reduce((s, x) => s + x.weight, 0);
    let r = rand() * total;
    let idx = pool.length - 1;
    for (let j = 0; j < pool.length; j++) {
      r -= (pool[j] as { num: number; weight: number }).weight;
      if (r <= 0) { idx = j; break; }
    }
    picks.push((pool[idx] as { num: number; weight: number }).num);
    pool.splice(idx, 1);
  }

  const c1 = picks.slice(0, 3);
  const c2 = picks.slice(3, 6);
  const c3 = picks.slice(6, 9);

  return {
    combo1: {
      numbers: c1,
      hitRate: calcHitRate(numFreqMap, c1, totalCount),
      freqMap: freqPctMap,
      zone: "low",
    },
    combo2: {
      numbers: c2,
      hitRate: calcHitRate(numFreqMap, c2, totalCount),
      freqMap: freqPctMap,
      zone: "mid",
    },
    combo3: {
      numbers: c3,
      hitRate: calcHitRate(numFreqMap, c3, totalCount),
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

  // 모든 시도 실패 → 통계 추정값 (annId 시드 적용)
  return estimatedResult(annId);
}
