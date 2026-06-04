/**
 * 입찰자 등수 계산 (박상빈님 2026-06-05 "-N등")
 *  - OpengCompt 전체 입찰자 기준
 *  - 적격(낙찰하한가 이상): opengRank 그대로 +N등 (낙찰=+1)
 *  - 부적격(낙찰하한가 미만, rmrk "낙찰하한선 미달"/"예가초과"/"무효"): 투찰가 내림차순 → -1등(하한가에 가장 근접) -2등 ...
 */
import type { G2BOpengCompt } from "./g2b";

// -N등(낙찰하한가 아래) 대상 = "낙찰하한선 미달"·"무효". "예가초과"(예정가 위)는 별도.
const BELOW_KEYWORDS = ["낙찰하한", "미달", "무효"];

type BidClass = "eligible" | "below" | "over"; // 적격 / 낙찰하한 미달 / 예가초과
function classify(rmrk: string | undefined, opengRank: string | undefined): BidClass {
  const r = (rmrk ?? "").trim();
  if (r.includes("예가초과") || r.includes("예정가")) return "over";
  // 적격: opengRank 있고 미달 키워드 없음
  if (parseInt(opengRank ?? "0", 10) > 0 && !BELOW_KEYWORDS.some((k) => r.includes(k))) return "eligible";
  return "below"; // 낙찰하한선 미달 / 무효 / 순위 빈값
}

function priceOf(c: G2BOpengCompt): number {
  return parseInt(String(c.bidprcAmt ?? "0").replace(/[^0-9]/g, ""), 10) || 0;
}

export interface RankedBidder {
  bizno: string;
  corpNm: string;
  bidPrice: number;
  bidRate: number;
  rank: number; // +N 적격(낙찰순위) / -N 낙찰하한 미달(하한가 근접순) / 0 예가초과
  disqualified: boolean;
  overLimit: boolean; // 예가초과(예정가 위)
  rmrk: string;
}

/** 전체 입찰자에 등수 부여 — 적격 +N / 낙찰하한 미달 -N / 예가초과 0 */
export function rankBidders(items: G2BOpengCompt[]): RankedBidder[] {
  // -N등은 "낙찰하한선 미달"만 (하한가 근접=투찰가 높은순 → -1, -2). 예가초과는 제외.
  const belowList = items
    .filter((c) => classify(c.rmrk, c.opengRank) === "below")
    .sort((a, b) => priceOf(b) - priceOf(a)); // 투찰가 내림차순 → -1 = 미달 중 최고가(하한가 근접)
  const belowRank = new Map<G2BOpengCompt, number>();
  belowList.forEach((c, i) => belowRank.set(c, -(i + 1)));

  return items.map((c) => {
    const kind = classify(c.rmrk, c.opengRank);
    const rank =
      kind === "eligible" ? (parseInt(c.opengRank ?? "0", 10) || 0)
      : kind === "below" ? (belowRank.get(c) ?? -999)
      : 0; // over(예가초과)
    return {
      bizno: String(c.prcbdrBizno ?? "").replace(/\D/g, "").slice(-10),
      corpNm: String(c.prcbdrNm ?? "").trim(),
      bidPrice: priceOf(c),
      bidRate: parseFloat(String(c.bidprcrt ?? "0")) || 0,
      rank,
      disqualified: kind !== "eligible",
      overLimit: kind === "over",
      rmrk: String(c.rmrk ?? "").trim(),
    };
  });
}

/** 특정 사업자번호의 등수 (의뢰 이전 내역 — 사용자 본인 투찰 -N등) */
export function rankOfBizno(items: G2BOpengCompt[], bizno: string): RankedBidder | null {
  const last10 = String(bizno ?? "").replace(/\D/g, "").slice(-10);
  if (last10.length < 10) return null;
  return rankBidders(items).find((r) => r.bizno === last10) ?? null;
}

/**
 * 특정 투찰가(AI 추천가 등)의 "가상 등수" — 그 공고 입찰자 분포에 끼워넣어 계산 (관리자 정확도용).
 * lowerLimit = 진짜 낙찰하한가.
 *  - targetPrice >= lowerLimit (적격): 하한가 이상 입찰자 중 targetPrice보다 낮은 수 + 1 (낮을수록 1등)
 *  - targetPrice <  lowerLimit (부적격): 하한가 미만 입찰자 중 targetPrice보다 높은 수 + 1 → -N등
 */
export function rankOfPrice(
  items: G2BOpengCompt[],
  targetPrice: number,
  lowerLimit: number,
): { rank: number; disqualified: boolean } {
  const prices = items.map(priceOf).filter((p) => p > 0);
  if (targetPrice < lowerLimit) {
    const disqHigher = prices.filter((p) => p < lowerLimit && p > targetPrice).length;
    return { rank: -(disqHigher + 1), disqualified: true };
  }
  const eligLower = prices.filter((p) => p >= lowerLimit && p < targetPrice).length;
  return { rank: eligLower + 1, disqualified: false };
}

/** 등수 → 표시 문자열 (+3등 / -1등 / 낙찰) */
export function formatRank(rank: number, totalBidders?: number | null): string {
  if (rank === 1) return "낙찰 (1위)";
  if (rank > 0) return `+${rank}등${totalBidders ? ` / ${totalBidders}` : ""}`;
  if (rank < 0) return `${rank}등 (부적격)`; // -1등 (부적격, 낙찰하한 미달)
  return "예가초과 (부적격)"; // rank 0
}
