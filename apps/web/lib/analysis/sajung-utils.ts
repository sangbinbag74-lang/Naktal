import type { SupabaseClient } from "@supabase/supabase-js";

/** 사정율 계산: 낙찰금액 + 낙찰률 + 기초금액 → 사정율(%) */
export function calcSajung(
  finalPrice: number,
  bidRate: number,
  budget: number,
): number {
  if (finalPrice <= 0 || bidRate <= 0 || budget <= 0) return 0;
  const estimatedPrice = finalPrice / (bidRate / 100);
  return (estimatedPrice / budget) * 100;
}

/** konepsId 목록으로 각 공고의 budget Map 조회 */
export async function buildBudgetMap(
  supabase: SupabaseClient,
  konepsIds: string[],
): Promise<Map<string, number>> {
  if (konepsIds.length === 0) return new Map();
  const unique = [...new Set(konepsIds)];
  const { data } = await supabase
    .from("Announcement")
    .select("konepsId, budget")
    .in("konepsId", unique);
  return new Map(
    (data ?? []).map((a: { konepsId: string; budget: string | number }) => [
      a.konepsId as string,
      Number(a.budget),
    ]),
  );
}

/** 동일 orgName + category 공고의 konepsId 목록 조회
 *  - category 일치 건수 < minForCategory 이면 category 조건 제거(발주처 전체)로 폴백
 */
export async function fetchOrgKonepsIds(
  supabase: SupabaseClient,
  orgName: string,
  category: string,
  limit = 200,
  minForCategory = 20,
): Promise<string[]> {
  const { data: exact } = await supabase
    .from("Announcement")
    .select("konepsId")
    .eq("orgName", orgName)
    .eq("category", category)
    .limit(limit);

  const exactIds = (exact ?? [])
    .map((a: { konepsId: string }) => a.konepsId)
    .filter(Boolean) as string[];

  // category 일치 건수가 충분하면 그대로 반환
  if (exactIds.length >= minForCategory) return exactIds;

  // 부족하면 category 조건 없이 발주처 전체로 폴백
  const { data: all } = await supabase
    .from("Announcement")
    .select("konepsId")
    .eq("orgName", orgName)
    .limit(limit);

  return (all ?? [])
    .map((a: { konepsId: string }) => a.konepsId)
    .filter(Boolean) as string[];
}

/** 0.1%p 단위 반올림 */
export function roundBucket(v: number): number {
  return Math.round(v * 10) / 10;
}

// ── 기관별 예가범위 ────────────────────────────────────────────────────────────

const ORG_RANGE_MAP: Record<string, number> = {
  "조달청": 2,
  "한국토지주택공사": 2,
  "한국전력공사": 2,
  "한국농어촌공사": 2,
  "한국마사회": 2,
  "한국수자원공사": 2.5,
  "한국가스공사": 2.5,
  "한국철도공사": 2.5,
  "한국도로공사": 3,
};

const LOCAL_GOV_KEYWORDS = ["특별자치도", "특별시", "광역시", "도청", "시청", "군청", "구청"];

/** 기관명으로 예가범위(%) 반환. 기본 ±2%, 지방자치단체 ±3% */
export function getOrgRange(orgName: string): number {
  if (ORG_RANGE_MAP[orgName]) return ORG_RANGE_MAP[orgName];
  for (const [key, val] of Object.entries(ORG_RANGE_MAP)) {
    if (orgName.includes(key)) return val;
  }
  if (LOCAL_GOV_KEYWORDS.some((k) => orgName.includes(k))) return 3;
  return 2;
}

/** 기관명으로 사정율 유효범위 반환 */
export function getSajungRange(orgName: string): { min: number; max: number; range: number } {
  const r = getOrgRange(orgName);
  return { min: 100 - r, max: 100 + r, range: r };
}
