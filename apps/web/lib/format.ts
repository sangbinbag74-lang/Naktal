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
