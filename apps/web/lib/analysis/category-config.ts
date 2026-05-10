/**
 * 업종(category) 별 입찰 방식 차이를 반영하는 통합 설정.
 *
 * 공사 vs 용역 vs 물품은 G2B 기준 사정율 분포 / 낙찰하한율 / A값 적용 / 예가방법 모두 다르므로
 * 통계 필터·fallback·default 값을 카테고리별로 분기해야 정확.
 *
 * 데이터 출처: G2B (sucsfbidLwltRate / aValueYn / cntrctCnclsMthdNm) + 국가계약법 시행령 + 지방계약법
 */

export type BidCategoryKind = "construction" | "service" | "goods" | "foreign" | "other";

/** category 문자열을 큰 분류로 매핑 */
export function classifyCategory(category: string | null | undefined): BidCategoryKind {
  if (!category) return "other";
  // 외자 공고는 별도
  if (category.includes("외자")) return "foreign";
  // 공사 (시설공사·전문건설·조경·전기·통신·소방 등 모두 "공사" 키워드 포함)
  if (category.includes("공사")) return "construction";
  // 용역 / 서비스
  if (category.includes("용역") || category.includes("서비스")) return "service";
  // 물품 / 납품
  if (category.includes("물품") || category.includes("납품")) return "goods";
  return "other";
}

/** 카테고리별 사정율 유효 범위 (이상값 제거용) */
export const SAJUNG_FILTER_BY_KIND: Record<BidCategoryKind, { min: number; max: number }> = {
  construction: { min: 85,  max: 125 }, // 공사: 99~101 ± 여유
  service:      { min: 50,  max: 110 }, // 용역: 60~95 협상 영향
  goods:        { min: 30,  max: 110 }, // 물품: 단가 경쟁 더 넓음
  foreign:      { min: 50,  max: 110 },
  other:        { min: 50,  max: 125 }, // 알 수 없을 때 보수적 범위
};

/** 카테고리별 사정율 default (ML 미학습·통계 부족 시 fallback) */
export const DEFAULT_SAJUNG_BY_KIND: Record<BidCategoryKind, {
  center: number; min: number; max: number; p25: number; p75: number;
}> = {
  construction: { center: 100,  min: 97,  max: 103, p25: 99,  p75: 101 },
  service:      { center: 87,   min: 70,  max: 100, p25: 80,  p75: 95  },
  goods:        { center: 80,   min: 60,  max: 100, p25: 70,  p75: 92  },
  foreign:      { center: 90,   min: 70,  max: 105, p25: 82,  p75: 97  },
  other:        { center: 100,  min: 90,  max: 110, p25: 95,  p75: 105 },
};

/** 카테고리별 낙찰하한율 default (rawJson.sucsfbidLwltRate 우선 사용, 누락 시 폴백) */
export const DEFAULT_LWLT_BY_KIND: Record<BidCategoryKind, number> = {
  construction: 87.745, // 지자체 종합건설 표준
  service:      80.0,   // 지자체 용역 표준
  goods:        80.0,   // 일반 물품 표준
  foreign:      80.0,
  other:        87.745, // 안전 fallback (공사 가정)
};

/** 추정가격(부가세 별도) → 기초금액(부가세 포함) 환산 배율 */
export function vatMultiplier(kind: BidCategoryKind): number {
  // 공사·용역·물품 모두 부가세 10% 적용 (면세 사업자 예외)
  void kind;
  return 1.1;
}

/** 카테고리·계약방법 조합으로 사정율 분석이 의미 있는지 판정 */
export function isAnalysisSupported(
  category: string | null | undefined,
  cntrctCnclsMthdNm?: string | null,
  bidMethod?: string | null,
): boolean {
  // 수의계약 / 단가계약 — 사정율 의미 없음
  if (cntrctCnclsMthdNm?.includes("수의")) return false;
  if (cntrctCnclsMthdNm?.includes("협상")) return false;
  if (bidMethod?.includes("단가")) return false;
  // 그 외 입찰 방식은 카테고리 무관 분석 시도 (부정확하더라도 표시)
  void category;
  return true;
}

/** 사용자 정책: 분석 핵심 카테고리 (공사) */
export function isCoreCategory(category: string | null | undefined): boolean {
  return classifyCategory(category) === "construction";
}
