/**
 * 한국 광역시·도 행정구역 별칭 매핑.
 * G2B 데이터의 jntcontrctDutyRgnNm1/2/3 필드는 정식 명칭(전라북도) 사용,
 * 사용자 등록 지역(CompanyProfile.regions)은 약칭(전북) 가능 → 양방향 매칭.
 */
export const REGION_ALIASES: Record<string, string[]> = {
  "전북": ["전북", "전라북도", "전북특별자치도"],
  "전남": ["전남", "전라남도"],
  "경북": ["경북", "경상북도"],
  "경남": ["경남", "경상남도"],
  "충북": ["충북", "충청북도"],
  "충남": ["충남", "충청남도"],
  "강원": ["강원", "강원도", "강원특별자치도"],
  "제주": ["제주", "제주도", "제주특별자치도"],
  "서울": ["서울", "서울특별시"],
  "부산": ["부산", "부산광역시"],
  "대구": ["대구", "대구광역시"],
  "인천": ["인천", "인천광역시"],
  "광주": ["광주", "광주광역시"],
  "대전": ["대전", "대전광역시"],
  "울산": ["울산", "울산광역시"],
  "세종": ["세종", "세종특별자치시"],
  "경기": ["경기", "경기도"],
};

/** 어떤 표기든 대표 약칭(전북·전남 등) 으로 정규화 */
export function normalizeRegion(s: string): string | null {
  const trim = (s ?? "").trim();
  if (!trim) return null;
  for (const [canonical, aliases] of Object.entries(REGION_ALIASES)) {
    if (aliases.some((a) => trim === a || trim.startsWith(a))) return canonical;
  }
  return null;
}

/** 사용자 등록 지역(약칭 또는 풀네임) 중 하나가 공고 의무지역 list 에 매칭되는지 */
export function matchesUserRegion(
  userRegions: string[],
  jntDutyRegions: (string | null | undefined)[],
): boolean {
  const userCanonical = new Set(userRegions.map(normalizeRegion).filter(Boolean) as string[]);
  if (userCanonical.size === 0) return false;
  for (const jnt of jntDutyRegions) {
    const c = normalizeRegion(jnt ?? "");
    if (c && userCanonical.has(c)) return true;
  }
  return false;
}
