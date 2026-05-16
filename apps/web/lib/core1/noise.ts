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
 * ⚠️ 2026-05-16 박상빈님 지시 적용:
 *   - "안전마진 넣으면 AI 의미 없다" → 양수 강제 마진 (Math.abs) 제거
 *   - 양방향 노이즈 복구 → 평균 0, AI 예측 그대로 (5/11 박상빈님 "현재 방식 효과적" OK)
 *   - 미달 위험은 calcBidPrice 의 Hard clamp (realLowerLimit + 1) 가 차단
 */
export function applySajungNoise(
  mlPredictedRate: number,
  userId: string,
  annId: string,
  sigma = 0.05,
): number {
  const noise = deterministicGaussian(`${userId}:${annId}`, sigma);
  return mlPredictedRate + noise;
}

/**
 * 사정율 → 추천 투찰금액 계산
 *
 * ⚠️ 2026-05-16 재설계 — 박상빈님 명시 지시 적용:
 *   "안전마진 넣으면 AI 의미 없다. 강제로 돈을 추가한 경우에 한해서다."
 *
 *   - σ × z 안전마진 완전 제거 (5/15 잘못 도입된 0.7%p 마진 폐기)
 *   - AI 예측 사정율 (predictedRate) 그대로 사용
 *   - 안전망: realLowerLimit + 1 hard clamp 만 유지 (절대 하한 미만 금지)
 *
 * 4개 값 일관성:
 *   사정율(predictedRate) → 예정가(budget × predictedRate) → 추천금액((예정가 - A) × lwlt + A)
 *   → 사용자가 G2B 계산기에 사정율 그대로 넣어 검증 가능
 *
 * 반환값:
 *   - estimatedPrice: 예정가 = budget × sajungRate
 *   - lowerLimit: 실제 G2B 낙찰하한가 (사정율 100%) — UI 표시·검증 기준
 *   - recommendedBid: AI 예측 사정율 그대로의 추천가 (hard-clamped)
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

  // 실제 G2B 낙찰하한가 (사정율 100% 가정) — hard clamp 최저선
  const realLowerLimit = Math.ceil((budget - aValueTotal) * lwltF + aValueTotal);
  // AI 예측 사정율 그대로 추천가 산출 (안전마진 X)
  const recommendedBid_raw = Math.ceil((estimatedPrice - aValueTotal) * lwltF + aValueTotal);
  // Hard clamp — 절대 하한가 아래 금지 (AI 예측이 100% 미만이면 발동)
  const recommendedBid     = Math.max(recommendedBid_raw, realLowerLimit + 1);

  return {
    estimatedPrice: Math.round(estimatedPrice),
    lowerLimit: realLowerLimit,
    safeBid: recommendedBid, // 변수명 호환성 유지 (호출자가 srvSafeBid 로 받음)
  };
}
