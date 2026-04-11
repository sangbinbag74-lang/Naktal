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

/** 동일 orgName + region 공고의 konepsId 목록 조회
 *  - 단가계약 제외, 예산 규모 유사 공고만 포함 (0.3x ~ 3x)
 *  - 발주처 공고(orgName) + 동일 지역·업종(region+category) 합산
 */
export async function fetchOrgKonepsIds(
  supabase: SupabaseClient,
  orgName: string,
  category: string,
  region: string,
  currentAnn: { bidMethod: string; budget: number },
): Promise<string[]> {
  const isUnitPrice = currentAnn.bidMethod?.includes("단가") ?? false;
  const budgetMin = Math.max(1_000_000, currentAnn.budget * 0.3);
  const budgetMax = currentAnn.budget * 3.0;

  type AnnRow = { konepsId: string; budget: string | number; rawJson: Record<string, string> | null };

  const [{ data: orgAnns }, { data: regionAnns }] = await Promise.all([
    supabase
      .from("Announcement")
      .select("konepsId, budget, rawJson")
      .eq("orgName", orgName)
      .eq("category", category)
      .limit(500),
    supabase
      .from("Announcement")
      .select("konepsId, budget, rawJson")
      .eq("category", category)
      .eq("region", region)
      .limit(300),
  ]);

  const allAnns: AnnRow[] = [...(orgAnns ?? []), ...(regionAnns ?? [])];

  const filtered = allAnns.filter((a) => {
    const b = Number(a.budget);
    if (b < 1_000_000) return false;
    if (b < budgetMin || b > budgetMax) return false;
    const mthd = (a.rawJson as Record<string, string> | null)?.bidMthdNm ?? "";
    if (!isUnitPrice && mthd.includes("단가")) return false;
    return true;
  });

  return Array.from(new Set(filtered.map((a) => a.konepsId as string))).filter(Boolean);
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

/** 기관명으로 사정율 이상값 필터 범위 반환 (예가범위 + buffer 5%) */
export function getSajungFilter(orgName: string): { min: number; max: number } {
  const r = getOrgRange(orgName);
  const buffer = 5;
  return { min: 100 - r - buffer, max: 100 + r + buffer };
}
