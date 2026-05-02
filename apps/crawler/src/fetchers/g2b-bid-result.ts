import Decimal from "decimal.js";
import { fetchBidResultPage, type G2BBidResult } from "./g2b-client";

const SCSBID_OPS = [
  "getScsbidListSttusThng",
  "getScsbidListSttusCnstwk",
  "getScsbidListSttusServc",
  "getScsbidListSttusFrgcpt",
];
import type { BidResultRow } from "../parsers/bid-result";
import { logger } from "../utils/logger";

// ─── G2B 항목 → BidResultRow 변환 ────────────────────────────────────────────
function mapToRow(item: G2BBidResult): BidResultRow | null {
  try {
    const annId = item.bidNtceNo?.trim();
    if (!annId) return null;

    const bidRateRaw   = (item.sucsfbidRate || "").replace(/[^0-9.]/g, "");
    const finalPriceRaw = (item.sucsfbidAmt || "").replace(/[^0-9]/g, "");
    const numBiddersRaw = (item.prtcptCnum || item.totPrtcptCo || "0").replace(/[^0-9]/g, "");

    if (!bidRateRaw || !finalPriceRaw) return null;

    const bidRate   = new Decimal(bidRateRaw).toFixed(4);
    const finalPrice = BigInt(parseInt(finalPriceRaw, 10));
    const numBidders = parseInt(numBiddersRaw, 10) || 0;

    if (finalPrice <= 0n) return null;

    const winnerName = (item.sucsfbidCorpNm || item.bidwinnrNm || "").trim() || undefined;

    // G2B SCSBID 응답에는 opengDt가 없고 rlOpengDt(실개찰일시)만 있음.
    // BidPublicInfoService 응답에는 opengDt가 있으므로 두 필드 모두 fallback.
    const openedAt = parseOpengDt(item.rlOpengDt || item.opengDt);

    return { annId, bidRate, finalPrice, numBidders, winnerName, openedAt };
  } catch {
    return null;
  }
}

function toG2BDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function parseOpengDt(raw: string | undefined | null): string | null {
  if (!raw || raw.length < 8) return null;
  if (raw.includes("-")) {
    const dt = new Date(raw.replace(" ", "T") + (raw.length <= 16 ? ":00+09:00" : "+09:00"));
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  const y = raw.slice(0, 4), mo = raw.slice(4, 6), d = raw.slice(6, 8);
  const hh = raw.slice(8, 10) || "00", mm = raw.slice(10, 12) || "00";
  const dt = new Date(`${y}-${mo}-${d}T${hh}:${mm}:00+09:00`);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

// ─── 낙찰결과 수집 메인 ──────────────────────────────────────────────────────
export interface FetchBidResultsOptions {
  fromDate?: string; // YYYYMMDD (기본: 오늘)
  toDate?: string;   // YYYYMMDD (기본: 오늘)
  numOfRows?: number;
  maxPages?: number;
}

export async function fetchBidResults(
  options: FetchBidResultsOptions = {}
): Promise<BidResultRow[]> {
  const numOfRows = options.numOfRows ?? 100;
  const maxPages  = options.maxPages ?? 100;

  const today = toG2BDate(new Date());
  const inqryBgnDt = `${options.fromDate ?? today}0000`;
  const inqryEndDt = `${options.toDate ?? today}2359`;

  logger.info(`G2B 낙찰결과 수집: ${inqryBgnDt} ~ ${inqryEndDt}`);

  const results: BidResultRow[] = [];

  // 4개 카테고리(물품/시설공사/용역/외자) 순회
  for (const operation of SCSBID_OPS) {
    let page = 1;
    while (page <= maxPages) {
      const { items, totalCount } = await fetchBidResultPage({
        pageNo: page, numOfRows, inqryBgnDt, inqryEndDt, operation,
      });

      if (items.length === 0) break;

      let saved = 0;
      for (const item of items) {
        const row = mapToRow(item);
        if (row) { results.push(row); saved++; }
      }

      logger.info(`  [${operation}] 페이지 ${page}: ${items.length}건 수신 / ${saved}건 변환 (누적 ${results.length} / 총 ${totalCount})`);

      if (page * numOfRows >= totalCount) break;
      page++;
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  logger.info(`G2B 낙찰결과 수집 완료: ${results.length}건`);
  return results;
}
