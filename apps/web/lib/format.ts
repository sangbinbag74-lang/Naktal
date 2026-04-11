/**
 * 공통 포맷 유틸리티
 * DB budget 컬럼은 원(KRW) 단위로 저장됨
 */

export function formatKRW(won: number): string {
  if (won >= 100_000_000) {
    const uk = Math.floor(won / 100_000_000);
    const man = Math.floor((won % 100_000_000) / 10_000);
    return man > 0 ? `${uk}억 ${man.toLocaleString()}만원` : `${uk}억원`;
  }
  if (won >= 10_000) {
    return `${Math.floor(won / 10_000).toLocaleString()}만원`;
  }
  return `${won.toLocaleString()}원`;
}

export function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 사정율 절대값: 소수점 3자리. 예: 103.456 → "103.456%" */
export function formatSajung(sajung: number): string {
  return `${sajung.toFixed(3)}%`;
}

/**
 * 사정율 편차: (sajung - orgAvg), 소수점 3자리, % 단위.
 * 예: formatDeviation(109.850, 109.840) → "+0.010%"
 */
export function formatDeviation(sajung: number, orgAvg: number): string {
  const dev = sajung - orgAvg;
  const sign = dev >= 0 ? "+" : "";
  return `${sign}${dev.toFixed(3)}%`;
}

/** 편차 색상: 양수(파랑) / 음수(빨강) */
export function deviationColor(sajung: number, orgAvg: number): string {
  return (sajung - orgAvg) >= 0 ? "#2563EB" : "#DC2626";
}

/** 절대값 + 편차 묶음 반환 */
export function formatSajungWithDev(sajung: number, orgAvg: number): {
  absolute: string; deviation: string; isPositive: boolean;
} {
  const dev = sajung - orgAvg;
  return {
    absolute: `${sajung.toFixed(3)}%`,
    deviation: `${dev >= 0 ? "+" : ""}${dev.toFixed(3)}%`,
    isPositive: dev >= 0,
  };
}
