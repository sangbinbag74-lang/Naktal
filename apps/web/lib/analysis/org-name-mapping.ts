/**
 * 박상빈님 5/22 K-3 — orgName 옛/신규 명칭 매핑
 *
 * 한국 정부조직 + 광역 + 교육청 명칭 변경으로 인한 SajungRateStat 매칭 누락 처리.
 * 박상빈님 실측 N=1: SajungRateStat 12,407건 (전체 8%) 매칭 누락 → orgName aliases 양방향 매칭.
 *
 * 검증 출처 (인터넷):
 *   - 국토해양부 → 국토교통부 (2013-03-23)
 *   - 미래창조과학부 → 과학기술정보통신부 (2017-07-26)
 *   - 안전행정부 → 행정자치부 → 행정안전부 (2014, 2017)
 *   - 지식경제부 → 산업통상자원부 (2013)
 *   - 농림수산식품부 → 농림축산식품부 (2013)
 *   - 인천 남구 → 미추홀구 (2018-07-01)
 *   - 전라북도 → 전북특별자치도 (2024)
 *   - 강원도 → 강원특별자치도 (2023)
 */

// 양방향 매핑 그룹 — 같은 그룹 안의 이름은 모두 같은 기관으로 간주
const ALIAS_GROUPS: string[][] = [
  // 광역 (도 → 특별자치도)
  ["전북특별자치도", "전라북도"],
  ["강원특별자치도", "강원도"],
  ["제주특별자치도", "제주도"],

  // 교육청
  ["전북특별자치도교육청", "전라북도교육청"],
  ["강원특별자치도교육청", "강원도교육청"],
  ["제주특별자치도교육청", "제주도교육청"],

  // 부처
  ["국토교통부", "국토해양부", "건설교통부"],
  ["행정안전부", "안전행정부", "행정자치부", "국민안전처"],
  ["과학기술정보통신부", "미래창조과학부"],
  ["산업통상자원부", "지식경제부"],
  ["농림축산식품부", "농림수산식품부"],
  ["보건복지부", "보건복지가족부"],
  ["교육부", "교육과학기술부", "교과부"],
  ["외교부", "외교통상부"],
  ["기획재정부", "재정경제부", "기획예산처"],

  // 광역시 구
  ["인천광역시 미추홀구", "인천광역시 남구"],
];

// prefix → aliases 인덱스 (빠른 조회용)
const PREFIX_INDEX = new Map<string, string[]>();
for (const group of ALIAS_GROUPS) {
  for (const name of group) {
    PREFIX_INDEX.set(name, group);
  }
}

/**
 * orgName 에 대한 옛/신규 별칭 모두 반환 (자기 자신 포함).
 *
 * 예:
 *   "전북특별자치도 익산시" → ["전북특별자치도 익산시", "전라북도 익산시"]
 *   "국토교통부 익산지방국토관리청" → ["국토교통부 익산지방국토관리청", "국토해양부 익산지방국토관리청", "건설교통부 익산지방국토관리청"]
 *   "서울특별시 중구" → ["서울특별시 중구"]  (매핑 없음 = 자기 자신만)
 */
export function getOrgNameAliases(orgName: string): string[] {
  if (!orgName) return [];
  // 1. 정확 매칭 (전체 이름이 그룹에 있음)
  const exact = PREFIX_INDEX.get(orgName);
  if (exact) return exact;

  // 2. prefix 매칭 (첫 토큰부터 점진적으로 매칭)
  //    예: "전북특별자치도 익산시" → "전북특별자치도" prefix 매칭
  const tokens = orgName.split(/\s+/);
  for (let i = tokens.length; i >= 1; i--) {
    const prefix = tokens.slice(0, i).join(" ");
    const aliases = PREFIX_INDEX.get(prefix);
    if (aliases) {
      const suffix = orgName.substring(prefix.length); // " 익산시" 등
      return aliases.map((a) => a + suffix);
    }
  }

  // 3. 매핑 없음 → 자기 자신만
  return [orgName];
}

/**
 * orgName aliases 의 prefix 별칭 (parent ILIKE 확장용).
 *
 * 예:
 *   "전북특별자치도 익산시" → ["전북특별자치도 익산시", "전라북도 익산시"]
 *   ILIKE prefix 매칭에 사용 → "전북특별자치도 익산시%" + "전라북도 익산시%"
 */
export function getOrgNamePrefixAliases(parentOrg: string): string[] {
  return getOrgNameAliases(parentOrg);
}
