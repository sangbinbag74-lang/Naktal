import Decimal from "decimal.js";

export interface BidResultRow {
  annId: string;
  bidRate: string;   // Decimal 문자열 ("87.3450")
  finalPrice: bigint;
  numBidders: number;
  winnerName?: string;
  openedAt?: string | null; // ISO timestamp, G2B opengDt 파싱 결과
}

/**
 * "87.3450%" 또는 "87.345" → "87.3450"
 */
export function parseBidRate(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) throw new Error(`bidRate 파싱 실패: "${raw}"`);
  return new Decimal(cleaned).toFixed(4);
}

/**
 * "123,456,000원" → BigInt(123456000)
 */
export function parseFinalPrice(raw: string): bigint {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) throw new Error(`finalPrice 파싱 실패: "${raw}"`);
  return BigInt(digits);
}

/**
 * 나라장터 낙찰 결과 테이블 한 행 → BidResultRow
 *
 * 낙찰 결과 컬럼 순서 (실제 사이트에서 확인 후 조정 필요):
 * [0] 공고번호   → annId (konepsId와 매핑)
 * [1] 낙찰금액   → finalPrice
 * [2] 투찰률     → bidRate
 * [3] 참여업체수 → numBidders
 */
export function parseBidResultRow(cells: string[]): BidResultRow | null {
  try {
    const annId        = cells[0]?.trim();
    const finalPriceRaw = cells[1]?.trim();
    const bidRateRaw   = cells[2]?.trim();
    const numBiddersRaw = cells[3]?.trim();

    if (!annId || !finalPriceRaw || !bidRateRaw || !numBiddersRaw) {
      return null;
    }

    const finalPrice  = parseFinalPrice(finalPriceRaw);
    const bidRate     = parseBidRate(bidRateRaw);
    const numBidders  = parseInt(numBiddersRaw.replace(/[^0-9]/g, ""), 10);

    if (isNaN(numBidders)) throw new Error(`numBidders 파싱 실패: "${numBiddersRaw}"`);

    return { annId, bidRate, finalPrice, numBidders };
  } catch {
    return null;
  }
}
