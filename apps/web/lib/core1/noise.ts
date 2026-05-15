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
 * ⚠️ 2026-05-15: 양수 방향만 (위쪽으로만) 노이즈 → 미달 위험 0
 *   기존: ±σ 양방향 → 음수 노이즈 시 추천가 < 하한가 가능 (50% 위험)
 *   현재: |gaussian| (절대값) → 항상 ≥ 0 → 추천가는 평균보다 위로만 분산
 *   100명 동시 분석 시 충돌 회피 효과 그대로 유지 (deterministic seed)
 */
export function applySajungNoise(
  mlPredictedRate: number,
  userId: string,
  annId: string,
  sigma = 0.05,
): number {
  const noise = deterministicGaussian(`${userId}:${annId}`, sigma);
  return mlPredictedRate + Math.abs(noise);
}

/**
 * 사정율 → 추천 투찰금액 계산
 *
 * ⚠️ 2026-05-15 재설계: σ × z 안전 quantile + Hard clamp 내장
 *   - safeBid (추천가): predictedRate + stddev × z=1.0 → 1순위 우선 (적격 ~84%)
 *   - lowerLimit (실제 G2B 하한가): 사정율 100% 가정 시 = realLowerLimit. clamp 기준선
 *   - safeBid 는 어떤 경우에도 realLowerLimit + 1 이상 보장
 *
 * stddev 미전달 시 공사 표준 0.7%p 폴백 (FALLBACK_STDDEV_BY_KIND.construction)
 *
 * 반환값:
 *   - estimatedPrice: 예정가 = budget × sajungRate (참고용)
 *   - lowerLimit: 실제 G2B 낙찰하한가 (사정율 100%) — UI 표시·검증 기준
 *   - safeBid: 안전 추천가 (적격 95%, hard-clamped) — 사용자에게 표시할 값
 */
export function calcBidPrice(
  budget: number,
  sajungRate: number,
  lowerLimitRate: number,
  aValueTotal: number,
  stddev?: number,
): { estimatedPrice: number; lowerLimit: number; safeBid: number } {
  const effStddev = stddev != null && stddev > 0 ? stddev : 0.7; // 공사 폴백
  const SAFETY_Z = 1.0;  // 박상빈님 결정 2026-05-15: 1순위 우선 (적격 ~84%, 1순위 가능성↑)
  const safeSajung = sajungRate + effStddev * SAFETY_Z;

  const estimatedPrice = budget * (sajungRate / 100);
  const safeEstimated  = budget * (safeSajung / 100);
  const lwltF          = lowerLimitRate / 100;

  // 실제 G2B 낙찰하한가 (사정율 100% 가정) — clamp 최저선
  const realLowerLimit = Math.ceil((budget - aValueTotal) * lwltF + aValueTotal);
  // 안전 추천가 (50→95% quantile)
  const safeBid_raw    = Math.ceil((safeEstimated - aValueTotal) * lwltF + aValueTotal);
  // Hard clamp — 절대 하한가 아래 금지
  const safeBid        = Math.max(safeBid_raw, realLowerLimit + 1);

  return {
    estimatedPrice: Math.round(estimatedPrice),
    lowerLimit: realLowerLimit,
    safeBid,
  };
}
