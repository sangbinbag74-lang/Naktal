/**
 * 사업자등록증 대표자명 매칭 — 클라이언트·서버 공용
 * 박상빈님 5/20 명시 — create-user 서버 측 재대조용
 *
 * 정규화: 괄호 안 한자/영문 제거 + 공백·점·하이픈 제거 + 영문 소문자
 * 공동대표 split: 콤마/중점/슬래시/"외 N명" 처리
 */

export function normalizeName(raw: string): string {
  if (!raw) return "";
  let s = raw;
  s = s.replace(/[\(（［\[][^\)）］\]]*[\)）］\]]/g, "");
  s = s.replace(/[\s\.\-·,/]+/g, "");
  return s.toLowerCase();
}

export function splitCoCeos(raw: string): string[] {
  if (!raw) return [];
  const stripped = raw.replace(/외\s*\d+\s*명/g, "");
  return stripped
    .split(/[,·/、､]|\s외\s/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isCeoMatch(userName: string, g2bCeoName: string): boolean {
  const userN = normalizeName(userName);
  if (!userN) return false;
  const candidates = splitCoCeos(g2bCeoName);
  return candidates.some((c) => normalizeName(c) === userN);
}

/**
 * 카카오 인증 명의가 대표자명과 다른지 = 실무자/대리 가입 판별 (2026-06-11, A안 짝 기능)
 *  - 카카오 미인증(null/빈값)이면 false (판별 불가 → 뱃지 안 띄움)
 *  - 공동대표·괄호·공백은 isCeoMatch가 흡수
 */
export function isProxySignup(
  ownerName: string,
  kakaoVerifiedName: string | null | undefined,
): boolean {
  if (!kakaoVerifiedName || !kakaoVerifiedName.trim()) return false;
  return !isCeoMatch(kakaoVerifiedName, ownerName);
}
