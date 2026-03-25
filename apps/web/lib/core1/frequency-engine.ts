/**
 * CORE 1 — 번호 역이용 엔진 (서버사이드 전용)
 *
 * 핵심 아이디어:
 *   낙찰률(투찰률)의 소수점 자릿수 패턴을 분석해 "고빈도 번호"를 찾고,
 *   경쟁이 낮은 "저빈도 번호" 조합을 추천합니다.
 *
 *   예: 낙찰률 87.345% → 3자리 패턴 [3,4,5]
 *       87.3% 대역에서 '45', '12', '99' 같은 끝 2자리 빈도를 분석
 *
 * 데이터 소스: BidResult.bidRate (Supabase DB)
 * 폴백: DB 데이터 없으면 통계적 기본값 반환
 */

import { createClient } from "@supabase/supabase-js";

export interface NumberCombo {
  numbers: number[];    // 추천 투찰률 끝 자리 조합 (예: [3, 11] → 87.311%)
  hitRate: number;      // 이 구간 낙찰 빈도 (%, 소수점 1자리)
  freqMap: Record<number, number>; // 해당 대역 전체 빈도맵 (번호→빈도%)
  zone: "low" | "mid" | "high"; // 빈도 존
}

export interface RecommendResult {
  combo1: NumberCombo;
  combo2: NumberCombo;
  combo3: NumberCombo;
  sampleSize: number;
  modelVersion: string;
  isEstimated: boolean; // true = DB 데이터 부족해서 통계 추정
}

// 투찰률 끝 3자리 (millidigit) 추출: "87.3450" → 345
function extractMillidigit(rate: string): number | null {
  const cleaned = rate.replace(/[^0-9.]/g, "");
  const n = parseFloat(cleaned);
  if (isNaN(n) || n <= 0 || n > 100) return null;
  // 소수점 이하 3자리 (0~999)
  return Math.round((n % 1) * 1000) % 1000;
}

// millidigit (0~999) → 번호 1~15 (균등 구간)
function millidigitToNum15(md: number): number {
  return Math.min(15, Math.floor((md * 15) / 1000) + 1);
}

// 빈도맵 → 히트율 (해당 번호들의 낙찰 점유율 %)
function calcHitRate(freqMap: Record<number, number>, numbers: number[], validCount: number): number {
  if (validCount === 0) return 0;
  const hits = numbers.reduce((s, n) => s + (freqMap[n] ?? 0), 0);
  return parseFloat(((hits / validCount) * 100).toFixed(1));
}

// 통계 추정 기본값 (DB 데이터 부족 시)
function estimatedResult(): RecommendResult {
  // 한국 적격심사 방식: 번호 1~15 중 0·5 배수 끝자리(번호 1,5,10,15)가 상대적 고빈도
  // 통계 기반 추정: 번호 3,7,11이 저빈도 경향
  const baseFreqMap: Record<number, number> = {};
  for (let i = 1; i <= 15; i++) {
    // 번호 5·10·15는 끝자리 집중으로 상대적 고빈도
    baseFreqMap[i] = (i % 5 === 0) ? 8.0 : 5.0;
  }

  const toCombo = (nums: number[], hitRate: number, zone: "low" | "mid" | "high"): NumberCombo => ({
    numbers: nums,
    hitRate,
    freqMap: baseFreqMap,
    zone,
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

export interface RecommendParams {
  category: string;
  budgetRange: string;   // "1억미만" | "1억-3억" | "3억-10억" | "10억-30억" | "30억이상"
  region: string;
  estimatedBidders?: number;
  supabaseUrl: string;
  supabaseKey: string;
}

/**
 * CORE 1 번호 추천 메인 함수
 * BidResult 테이블에서 해당 조건의 낙찰률 분포를 분석해 저빈도 조합을 추천
 */
export async function recommendNumbers(
  params: RecommendParams,
): Promise<RecommendResult> {
  const { supabaseUrl, supabaseKey, category, budgetRange, region, estimatedBidders } = params;

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Step 1: 조건에 맞는 Announcement ID 목록 조회
  // (Supabase 조인 필터는 NOT VALID FK에서 불안정 → 2단계 쿼리로 변경)
  let annIds: string[] | null = null;
  const hasFilter = (category && category !== "전체") || (region && region !== "전국");

  if (hasFilter) {
    let annQuery = supabase
      .from("Announcement")
      .select("id")
      .limit(3000);

    if (category && category !== "전체") {
      annQuery = annQuery.ilike("category", `%${category.split(" ")[0]}%`);
    }
    if (region && region !== "전국") {
      annQuery = annQuery.ilike("region", `%${region}%`);
    }

    const { data: annData } = await annQuery;
    annIds = (annData ?? []).map((a: { id: string }) => a.id);

    // 조건에 맞는 공고가 없으면 통계 추정값 반환
    if (annIds.length === 0) return estimatedResult();
  }

  // Step 2: BidResult 조회 (annId 필터 적용)
  let query = supabase
    .from("BidResult")
    .select("bidRate, numBidders")
    .order("createdAt", { ascending: false })
    .limit(5000);

  if (annIds !== null) {
    query = query.in("annId", annIds);
  }

  const { data, error } = await query;

  if (error || !data || data.length < 30) {
    // 데이터 부족 → 통계 추정값 반환
    return estimatedResult();
  }

  // 낙찰률 → 번호 1~15 빈도맵 구성
  // millidigit(0~999)을 15개 구간으로 균등 분할 → 번호 1~15
  const numFreqMap: Record<number, number> = {};
  for (let i = 1; i <= 15; i++) numFreqMap[i] = 0; // 모든 번호 초기화
  let validCount = 0;

  for (const row of data) {
    const md = extractMillidigit(String(row.bidRate));
    if (md === null) continue;
    const num = millidigitToNum15(md);
    numFreqMap[num] = (numFreqMap[num] ?? 0) + 1;
    validCount++;
  }

  if (validCount < 30) return estimatedResult();

  // 전체 빈도 → 비율(%) 변환 (프론트 히트맵용)
  const freqPctMap: Record<number, number> = {};
  for (const [k, v] of Object.entries(numFreqMap)) {
    freqPctMap[parseInt(k)] = parseFloat(((v / validCount) * 100).toFixed(1));
  }

  // 입찰자 수에 따른 대역 분류
  const bidderRange = classifyBidderRange(estimatedBidders);

  // 번호 1~15를 빈도 낮은 순 정렬 → 상위 70% (저빈도) 추천 대상
  const sorted = Object.entries(numFreqMap)
    .map(([k, v]) => ({ num: parseInt(k), freq: v }))
    .sort((a, b) => a.freq - b.freq);

  // bottom 70% = 약 10개 번호를 3구간으로 분할
  const bottom = sorted.slice(0, Math.max(3, Math.floor(sorted.length * 0.7)));
  const third = Math.max(1, Math.floor(bottom.length / 3));
  const zone1 = bottom.slice(0, third).map((x) => x.num);           // 극저빈도
  const zone2 = bottom.slice(third, third * 2).map((x) => x.num);   // 저빈도
  const zone3 = bottom.slice(third * 2).map((x) => x.num);          // 중저빈도

  const pick = (arr: number[], n = 3) => arr.slice(0, n);

  return {
    combo1: {
      numbers: pick(zone1),
      hitRate: calcHitRate(numFreqMap, pick(zone1), validCount),
      freqMap: freqPctMap,
      zone: "low",
    },
    combo2: {
      numbers: pick(zone2),
      hitRate: calcHitRate(numFreqMap, pick(zone2), validCount),
      freqMap: freqPctMap,
      zone: "mid",
    },
    combo3: {
      numbers: pick(zone3),
      hitRate: calcHitRate(numFreqMap, pick(zone3), validCount),
      freqMap: freqPctMap,
      zone: "high",
    },
    sampleSize: validCount,
    modelVersion: `freq-v1.${bidderRange}`,
    isEstimated: false,
  };
}

function classifyBidderRange(n?: number): string {
  if (!n) return "unknown";
  if (n <= 5) return "1-5";
  if (n <= 10) return "6-10";
  if (n <= 20) return "11-20";
  if (n <= 50) return "21-50";
  return "51+";
}
