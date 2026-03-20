/**
 * CORE 1 v2 — 발주처(orgName) 패턴 반영
 * OrgBiddingPattern 테이블에서 발주처별 투찰률 빈도를 조회해
 * 기본 freqMap에 가중 평균 적용.
 */

import { createServerClient } from "@supabase/ssr";

export interface OrgFreqMap {
  freqMap: Record<number, number>;
  orgName: string;
  sampleSize: number;
}

/**
 * 발주처 패턴 조회. 없으면 null 반환.
 */
export async function getOrgPattern(
  orgName: string,
  supabaseUrl: string,
  supabaseKey: string,
): Promise<OrgFreqMap | null> {
  if (!orgName) return null;

  const supabase = createServerClient(supabaseUrl, supabaseKey, { cookies: () => null as any });

  const { data } = await supabase
    .from("OrgBiddingPattern")
    .select("freqMap,sampleSize,orgName")
    .eq("orgName", orgName)
    .maybeSingle();

  if (!data || data.sampleSize < 10) return null;

  return {
    freqMap: data.freqMap as Record<number, number>,
    sampleSize: data.sampleSize,
    orgName: data.orgName,
  };
}

/**
 * 전체 freqMap과 발주처 freqMap을 가중 평균 합산
 * 발주처 데이터 비중: sampleSize가 클수록 높아짐 (최대 40%)
 */
export function blendFreqMaps(
  globalMap: Record<number, number>,
  orgMap: OrgFreqMap,
): Record<number, number> {
  const orgWeight = Math.min(0.4, orgMap.sampleSize / 500); // 500건 이상이면 40%
  const globalWeight = 1 - orgWeight;

  const result: Record<number, number> = {};
  const allKeys = new Set([
    ...Object.keys(globalMap).map(Number),
    ...Object.keys(orgMap.freqMap).map(Number),
  ]);

  for (const k of allKeys) {
    const g = globalMap[k] ?? 0;
    const o = orgMap.freqMap[k] ?? 0;
    result[k] = parseFloat((g * globalWeight + o * orgWeight).toFixed(2));
  }

  return result;
}

/**
 * OrgBiddingPattern 업데이트 (BidResult 기반)
 * apps/crawler 크롤러나 별도 스크립트에서 호출
 */
export async function updateOrgPattern(
  orgName: string,
  bidRates: string[], // "87.3450" 형식
  supabaseUrl: string,
  supabaseKey: string,
): Promise<void> {
  if (bidRates.length < 5) return; // 최소 5건 이상

  const freqMap: Record<number, number> = {};
  for (const rate of bidRates) {
    const n = parseFloat(rate);
    if (isNaN(n) || n <= 0 || n > 100) continue;
    const md = Math.round((n % 1) * 1000) % 1000;
    freqMap[md] = (freqMap[md] ?? 0) + 1;
  }

  const total = Object.values(freqMap).reduce((s, v) => s + v, 0);
  const freqPct: Record<number, number> = {};
  const deviation: Record<number, number> = {};
  const avgFreq = total / 1000;

  for (const [k, v] of Object.entries(freqMap)) {
    freqPct[parseInt(k)] = parseFloat(((v / total) * 100).toFixed(2));
    deviation[parseInt(k)] = parseFloat(((v / total - avgFreq / total) * 100).toFixed(2));
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, { cookies: () => null as any });
  await supabase.from("OrgBiddingPattern").upsert(
    { orgName, freqMap: freqPct, deviation, sampleSize: bidRates.length },
    { onConflict: "orgName" },
  );
}
