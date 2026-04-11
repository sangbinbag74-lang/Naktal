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

/** konepsId 목록으로 각 공고의 budget + deadline Map 조회 */
export async function buildBudgetAndDateMap(
  supabase: SupabaseClient,
  konepsIds: string[],
): Promise<Map<string, { budget: number; deadline: string | null }>> {
  if (konepsIds.length === 0) return new Map();
  const unique = [...new Set(konepsIds)];
  const { data } = await supabase
    .from("Announcement")
    .select("konepsId, budget, deadline")
    .in("konepsId", unique);
  return new Map(
    (data ?? []).map((a: { konepsId: string; budget: string | number; deadline: string | null }) => [
      a.konepsId as string,
      { budget: Number(a.budget), deadline: a.deadline as string | null },
    ]),
  );
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

/**
 * orgName에서 핵심 기관명 추출
 * "전북특별자치도 부안군" → "부안군"
 * "한국농어촌공사 전북지역본부 부안지사" → "한국농어촌공사"
 * "전라북도교육청 부안여자고등학교" → "부안여자고등학교"
 */
export function extractCoreOrgName(orgName: string): string {
  if (!orgName) return orgName;
  const prefixes = [
    "전북특별자치도 ", "전라북도 ", "경기도 ", "서울특별시 ",
    "부산광역시 ", "인천광역시 ", "대구광역시 ", "광주광역시 ",
    "대전광역시 ", "울산광역시 ", "세종특별자치시 ", "강원특별자치도 ",
    "강원도 ", "충청북도 ", "충청남도 ", "전라남도 ", "경상북도 ", "경상남도 ",
    "제주특별자치도 ",
  ];
  let core = orgName;
  for (const prefix of prefixes) {
    if (core.startsWith(prefix)) { core = core.slice(prefix.length); break; }
  }
  const eduPrefixes = ["교육청 ", "교육지원청 "];
  for (const ep of eduPrefixes) {
    if (core.includes(ep)) { core = core.split(ep).pop() ?? core; break; }
  }
  return core;
}

/** 동일 orgName + region 공고의 konepsId 목록 조회
 *  - 단가계약 제외, 예산 규모 유사 공고만 포함 (0.3x ~ 3x)
 *  - 발주처 공고(orgName) + 동일 지역·업종(region+category) 합산
 *  - orgScope="expand": 핵심 기관명 ILIKE 확장 검색 (명칭 변경 기관 포함)
 */
export async function fetchOrgKonepsIds(
  supabase: SupabaseClient,
  orgName: string,
  category: string | null,  // null = 발주처 전체 업종 (전체업종 모드)
  region: string,
  currentAnn: { bidMethod: string; budget: number },
  orgScope: "exact" | "expand" = "exact",
): Promise<string[]> {
  const isUnitPrice = currentAnn.bidMethod?.includes("단가") ?? false;
  // budget=0이면 예산 범위 필터 비활성화 (100만원 미만 제외만 유지)
  const hasBudget = currentAnn.budget > 0;
  // 전체업종(category=null) 모드는 업종 오염을 줄이기 위해 예산 범위를 좁게 (0.5x~2.0x)
  const isAllCategory = category === null;
  const budgetMin = hasBudget ? Math.max(1_000_000, currentAnn.budget * (isAllCategory ? 0.5 : 0.3)) : 1_000_000;
  const budgetMax = hasBudget ? currentAnn.budget * (isAllCategory ? 2.0 : 3.0) : Infinity;

  type AnnRow = { konepsId: string; budget: string | number; rawJson: Record<string, string> | null };

  // orgScope에 따라 orgName 조건 분기
  const coreOrg = orgScope === "expand" ? extractCoreOrgName(orgName) : null;

  const [{ data: orgAnns }, { data: regionAnns }] = await Promise.all([
    category
      ? (orgScope === "expand"
          ? supabase.from("Announcement").select("konepsId, budget, rawJson").ilike("orgName", `%${coreOrg}%`).eq("category", category).limit(500)
          : supabase.from("Announcement").select("konepsId, budget, rawJson").eq("orgName", orgName).eq("category", category).limit(500))
      : (orgScope === "expand"
          ? supabase.from("Announcement").select("konepsId, budget, rawJson").ilike("orgName", `%${coreOrg}%`).limit(500)
          : supabase.from("Announcement").select("konepsId, budget, rawJson").eq("orgName", orgName).limit(500)),
    category
      ? supabase.from("Announcement").select("konepsId, budget, rawJson").eq("category", category).eq("region", region).limit(300)
      : supabase.from("Announcement").select("konepsId, budget, rawJson").eq("region", region).limit(300),
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

/** 사정율 유효범위 상수 (이상값 제거용) */
export const SAJUNG_FILTER = { min: 85, max: 125 } as const;
