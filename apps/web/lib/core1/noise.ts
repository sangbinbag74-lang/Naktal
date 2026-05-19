// 사용자 × 공고 deterministic 노이즈 (Box-Muller + FNV-1a)
// 같은 (userId, annId) 입력 → 항상 동일 결과
// σ=0.05%p 가우시안 → 100명 동시 분석 시 사정율 충돌 확률 거의 0
// 표준 정규분포 z = sqrt(-2 ln u1) × cos(2π u2)

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

export function deterministicGaussian(seed: string, sigma = 0.05): number {
  const h1 = fnv1a(seed + ":a") || 1;
  const h2 = fnv1a(seed + ":b") || 1;
  const u1 = Math.max(h1 / 0xFFFFFFFF, 1e-10);
  const u2 = h2 / 0xFFFFFFFF;
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return z * sigma;
}

/**
 * ML 예측 사정율에 사용자별 노이즈를 더한 "실 적용 사정율" 반환
 * 같은 사용자가 같은 공고를 다시 조회해도 동일한 값 보장
 *
 * ⚠️ 2026-05-17 박상빈님 ★ 조합 적용 (correction_design_v5):
 *   - 음수만 미러 (Math.abs(noise)) = 절반 가우시안 = 양수 방향 노이즈
 *   - 본 분석 결과: 적격 52.16% / ±0.1% 12.59% (v2+xgb+cat 균등 + 음수 미러)
 *   - 박상빈님 5/16 "안전마진 X" = 강제 양수 마진 X. 음수 미러 = 노이즈 분포 변경 (별개)
 *   - 미달 위험 차단 = 박상빈님 5/17 명시 ★ 조합 핵심
 */
export function applySajungNoise(
  mlPredictedRate: number,
  userId: string,
  annId: string,
  sigma = 0.03,  // 박상빈님 5/19 명시 M1-N03 채택 — 145K 백테스트 best (이전 0.05)
): number {
  const noise = deterministicGaussian(`${userId}:${annId}`, sigma);
  return mlPredictedRate + Math.abs(noise);  // ★ 음수만 미러 (5/17 명시)
}

/**
 * 사정율 → 추천 투찰금액 계산
 *
 * ⚠️ 2026-05-17 박상빈님 명시 정정:
 *   "사정율 100% ≠ 낙찰하한가" — realLowerLimit (사정율 100% 가정) 자체가 잘못된 개념.
 *   진짜 낙찰하한가 = G2B 가 정한 진짜 사정율 × bsisAmt × 낙찰하한율 (사후만 확인 가능).
 *   = Hard clamp (realLowerLimit + 1) 도 박상빈님 명시 위반 → 완전 제거.
 *
 * 박상빈님 명시 (5/12·5/15·5/16·5/17 종합):
 *   - "안전마진 넣으면 AI 의미 없다. 강제로 돈을 추가한 경우에 한해서다."
 *   - 사정율 97~103% 정상 (CLAUDE.md)
 *   - Hard clamp = 사정율 100% 기준 가정 = 잘못된 보정
 *   - AI 예측 사정율 (predictedRate) 그대로, 어떤 clamp/마진도 X
 *
 * 4개 값 일관성:
 *   사정율(predictedRate) → 예정가(budget × predictedRate) → 추천금액((예정가 - A) × lwlt + A)
 *   → 사용자가 G2B 계산기에 사정율 그대로 넣어 검증 가능
 *
 * 반환값:
 *   - estimatedPrice: 예정가 = budget × sajungRate
 *   - lowerLimit: 사정율 100% 기준 참조 가격 (UI 표시용, 진짜 낙찰하한가 아님)
 *   - recommendedBid: AI 예측 사정율 그대로의 추천가 (no clamp, no margin)
 */
export function calcBidPrice(
  budget: number,
  sajungRate: number,
  lowerLimitRate: number,
  aValueTotal: number,
  _stddev?: number,
): { estimatedPrice: number; lowerLimit: number; safeBid: number } {
  const estimatedPrice = budget * (sajungRate / 100);
  const lwltF          = lowerLimitRate / 100;

  // UI 표시용 참조 가격 (사정율 100% 기준) — 진짜 낙찰하한가 아님
  const refLowerLimit = Math.ceil((budget - aValueTotal) * lwltF + aValueTotal);
  // AI 예측 사정율 그대로 추천가 산출 (Hard clamp 제거, 박상빈님 5/17 명시)
  const recommendedBid = Math.ceil((estimatedPrice - aValueTotal) * lwltF + aValueTotal);

  return {
    estimatedPrice: Math.round(estimatedPrice),
    lowerLimit: refLowerLimit,
    safeBid: recommendedBid, // 변수명 호환성 유지 (호출자가 srvSafeBid 로 받음)
  };
}
