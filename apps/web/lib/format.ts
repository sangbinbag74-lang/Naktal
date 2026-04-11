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

/**
 * 사정율 2중 표기: 절대값 + 평균 대비 편차
 * 예: 103.50% (+1.20%p)
 */
export function fmtSajungWithDiff(rate: number, avg: number): string {
  const diff = rate - avg;
  const sign = diff >= 0 ? "+" : "";
  return `${rate.toFixed(2)}% (${sign}${diff.toFixed(2)}%p)`;
}

export function fmtSajungDiff(diff: number): string {
  const sign = diff >= 0 ? "+" : "";
  return `${sign}${diff.toFixed(2)}%p`;
}

/** 사정율 절대값 → 100 기준 편차 문자열. 예: 103.5 → "+3.500%p" */
export function formatSajungDeviation(sajung: number): string {
  const dev = sajung - 100;
  return `${dev >= 0 ? "+" : ""}${dev.toFixed(3)}%p`;
}

/** 통일 편차 포맷 (소수점 2자리). 예: 103.5 → "+3.50%p" */
export function fmtDeviation(sajung: number): string {
  const d = Math.round((sajung - 100) * 100) / 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(2)}%p`;
}

/** 사정율 절대값 포맷. 예: 103.456 → "103.456%" */
export function fmtSajung(sajung: number): string {
  return `${sajung.toFixed(3)}%`;
}
