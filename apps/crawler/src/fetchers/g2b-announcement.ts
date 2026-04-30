import Decimal from "decimal.js";
import { fetchAnnouncementPage, NTCE_OPS, type G2BAnnouncement } from "./g2b-client";
import type { AnnouncementRow } from "../parsers/announcement";
import { logger } from "../utils/logger";
import { MAIN_CNSTWK_MAP, parseSubCategories } from "../category-map";

// ─── 지역 추출 ────────────────────────────────────────────────────────────────
const REGION_PREFIXES: [string, string][] = [
  ["서울", "서울"], ["부산", "부산"], ["대구", "대구"], ["인천", "인천"],
  ["광주", "광주"], ["대전", "대전"], ["울산", "울산"], ["세종", "세종"],
  ["경기", "경기"], ["강원", "강원"],
  ["충청북도", "충북"], ["충청남도", "충남"], ["충북", "충북"], ["충남", "충남"],
  ["전라북도", "전북"], ["전라남도", "전남"], ["전북", "전북"], ["전남", "전남"],
  ["경상북도", "경북"], ["경상남도", "경남"], ["경북", "경북"], ["경남", "경남"],
  ["제주", "제주"],
];

function extractRegion(addr: string): string {
  if (!addr) return "";
  const trimmed = addr.trim();
  for (const [prefix, label] of REGION_PREFIXES) {
    if (trimmed.startsWith(prefix)) return label;
  }
  return trimmed.slice(0, 2);
}

// ─── G2B 날짜 → Date ─────────────────────────────────────────────────────────
// "YYYY-MM-DD HH:MM:SS" 또는 "YYYYMMDDHHMM" 두 형식 모두 처리
function parseG2BDate(raw: string): Date | null {
  if (!raw || raw.length < 8) return null;
  if (raw.includes("-")) {
    const dt = new Date(raw.replace(" ", "T") + (raw.length <= 16 ? ":00+09:00" : "+09:00"));
    return isNaN(dt.getTime()) ? null : dt;
  }
  const y  = raw.slice(0, 4);
  const mo = raw.slice(4, 6);
  const d  = raw.slice(6, 8);
  const hh = raw.slice(8, 10) || "00";
  const mm = raw.slice(10, 12) || "00";
  const dt = new Date(`${y}-${mo}-${d}T${hh}:${mm}:00+09:00`);
  return isNaN(dt.getTime()) ? null : dt;
}

// ─── 엔드포인트 → 업무 분류 매핑 ────────────────────────────────────────────
const OP_TO_CATEGORY: Record<string, string> = {
  getBidPblancListInfoServc:   "용역",
  getBidPblancListInfoCnstwk:  "시설공사",
  getBidPblancListInfoThng:    "물품",
};

// ─── G2B 항목 → AnnouncementRow 변환 ─────────────────────────────────────────
function mapToRow(item: G2BAnnouncement, operation: string): AnnouncementRow | null {
  try {
    const konepsId = item.bidNtceNo?.trim();
    const title    = item.bidNtceNm?.trim();
    const orgName  = (item.ntceInsttNm || item.demInsttNm)?.trim();

    if (!konepsId || !title || !orgName) return null;

    // 예산: 배정예산액 → 추정가격 순서로 fallback
    const budgetRaw = (item.asignBdgtAmt || item.presmptPrce || "0").replace(/[^0-9]/g, "");
    const budgetNum = parseInt(budgetRaw, 10);
    if (!budgetNum || budgetNum <= 0) return null;

    const deadline = parseG2BDate(item.bidClseDt);
    if (!deadline) return null;

    // category: Cnstwk는 mainCnsttyNm으로 세분류, 나머지는 pubPrcrmnt 필드 → 엔드포인트 기반
    const category = operation === "getBidPblancListInfoCnstwk"
      ? (MAIN_CNSTWK_MAP[item.mainCnsttyNm ?? ""] || "시설공사")
      : (item.pubPrcrmntMidClsfcNm || item.pubPrcrmntLrgClsfcNm || OP_TO_CATEGORY[operation] || item.ntceKindNm || "");
    const region   = extractRegion(item.ntceInsttAddr || item.ntceInsttNm || item.demInsttNm || "");

    const rawJson: Record<string, string> = {};
    for (const [k, v] of Object.entries(item)) rawJson[k] = String(v ?? "");

    const subCategories = operation === "getBidPblancListInfoCnstwk"
      ? parseSubCategories(rawJson)
      : [];

    // rawJson → 전용 컬럼 승격 (reparse 없이 바로 채움)
    const sucsfbidLwltRate = parseFloat((item.sucsfbidLwltRate ?? "0").replace(/[^0-9.]/g, "")) || 0;
    const bidNtceDtlUrl = item.bidNtceDtlUrl ?? "";
    const ntceInsttOfclTelNo = item.ntceInsttOfclTelNo ?? "";
    const ciblAplYn = item.ciblAplYn ?? "";
    const mtltyAdvcPsblYn = item.mtltyAdvcPsblYn ?? "";

    return {
      konepsId,
      title,
      orgName,
      budget: BigInt(budgetNum),
      deadline,
      category,
      region,
      rawJson,
      subCategories,
      sucsfbidLwltRate,
      bidNtceDtlUrl,
      ntceInsttOfclTelNo,
      ciblAplYn,
      mtltyAdvcPsblYn,
    };
  } catch {
    return null;
  }
}

// ─── 날짜 문자열 헬퍼 (YYYYMMDD) ─────────────────────────────────────────────
function toG2BDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

// ─── 공고 수집 메인 ───────────────────────────────────────────────────────────
export interface FetchAnnouncementsOptions {
  /** 조회 시작일 YYYYMMDD (기본: 오늘) */
  fromDate?: string;
  /** 조회 종료일 YYYYMMDD (기본: 오늘) */
  toDate?: string;
  /** 페이지당 건수 (max 999, 기본 100) */
  numOfRows?: number;
  /** 최대 페이지 수 (기본 100) */
  maxPages?: number;
}

export async function fetchAnnouncements(
  options: FetchAnnouncementsOptions = {}
): Promise<AnnouncementRow[]> {
  const numOfRows = options.numOfRows ?? 100;
  const maxPages  = options.maxPages ?? 100;

  const today = toG2BDate(new Date());
  const inqryBgnDt = `${options.fromDate ?? today}0000`;
  const inqryEndDt = `${options.toDate ?? today}2359`;

  logger.info(`G2B 공고 수집: ${inqryBgnDt} ~ ${inqryEndDt}`);

  const results: AnnouncementRow[] = [];

  // 3개 타입(용역/시설공사/물품) 순회 — 낙찰결과 수집과 동일 패턴
  for (const operation of NTCE_OPS) {
    let page = 1;
    while (page <= maxPages) {
      const { items, totalCount } = await fetchAnnouncementPage({
        pageNo: page,
        numOfRows,
        inqryDiv: "1",
        inqryBgnDt,
        inqryEndDt,
        operation,
      });

      if (items.length === 0) break;

      let saved = 0;
      for (const item of items) {
        const row = mapToRow(item, operation);
        if (row) { results.push(row); saved++; }
      }

      logger.info(`  [${operation}] 페이지 ${page}: ${items.length}건 수신 / ${saved}건 변환 (누적 ${results.length} / 총 ${totalCount})`);

      if (page * numOfRows >= totalCount) break;
      page++;
      await new Promise((r) => setTimeout(r, 300)); // API rate limit 방지
    }
  }

  logger.info(`G2B 공고 수집 완료: ${results.length}건`);
  return results;
}
