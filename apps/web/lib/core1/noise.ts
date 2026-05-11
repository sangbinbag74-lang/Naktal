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
 * 사정율 → 추천 투찰금액 계산 (표준 공식, 안전 마진 없음)
 * 화면 표시 사정율 = G2B 계산기 입력 사정율 = 동일 결과 보장
 */
export function calcBidPrice(
  budget: number,
  sajungRate: number,
  lowerLimitRate: number,
  aValueTotal: number,
): { estimatedPrice: number; lowerLimit: number } {
  const estimatedPrice = budget * (sajungRate / 100);
  const lowerLimit = Math.ceil((estimatedPrice - aValueTotal) * (lowerLimitRate / 100) + aValueTotal);
  return { estimatedPrice: Math.round(estimatedPrice), lowerLimit };
}
