import Decimal from "decimal.js";
import { fetchAnnouncementPage, NTCE_OPS, G2BCode07Error, type G2BAnnouncement } from "./g2b-client";
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
export function mapToRow(item: G2BAnnouncement, operation: string): AnnouncementRow | null {
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

  // op 병렬 + 페이지 batch(10) 패턴 (검증된 가속, feedback_recollect_acceleration.md)
  async function fetchOp(operation: typeof NTCE_OPS[number]): Promise<AnnouncementRow[]> {
    const opResults: AnnouncementRow[] = [];

    // 1차: page 1 호출로 totalCount 확보
    let r1: { items: G2BAnnouncement[]; totalCount: number };
    try {
      r1 = await fetchAnnouncementPage({
        pageNo: 1, numOfRows, inqryDiv: "1", inqryBgnDt, inqryEndDt, operation,
      });
    } catch (e) {
      if (e instanceof G2BCode07Error) {
        logger.warn(`  [${operation}] page=1 resultCode=07 — 한도/장애 의심, 호출자 전파`);
        throw e;
      }
      throw e;
    }

    if (r1.items.length === 0) return opResults;

    // page 1 결과 처리
    for (const item of r1.items) {
      const row = mapToRow(item, operation);
      if (row) opResults.push(row);
    }
    logger.info(`  [${operation}] page=1: ${r1.items.length}건 (총 ${r1.totalCount})`);

    const totalPages = Math.min(maxPages, Math.ceil(r1.totalCount / numOfRows));
    if (totalPages <= 1) return opResults;

    // page 2~totalPages: batch(10) 병렬
    const BATCH = 10;
    for (let batchStart = 2; batchStart <= totalPages; batchStart += BATCH) {
      const batchPages: number[] = [];
      for (let p = batchStart; p < batchStart + BATCH && p <= totalPages; p++) batchPages.push(p);
      const batchResults = await Promise.all(batchPages.map(async (p) => {
        try {
          return await fetchAnnouncementPage({
            pageNo: p, numOfRows, inqryDiv: "1", inqryBgnDt, inqryEndDt, operation,
          });
        } catch (e) {
          // page>1 의 G2BCode07 = 자연 종료 신호로 처리
          if (e instanceof G2BCode07Error) return { items: [] as G2BAnnouncement[], totalCount: r1.totalCount };
          // 1회 retry
          await new Promise((rs) => setTimeout(rs, 1500));
          try {
            return await fetchAnnouncementPage({
              pageNo: p, numOfRows, inqryDiv: "1", inqryBgnDt, inqryEndDt, operation,
            });
          } catch (e2) {
            logger.error(`  [${operation}] page=${p} 2회 실패: ${(e2 as Error).message}`);
            return { items: [] as G2BAnnouncement[], totalCount: r1.totalCount };
          }
        }
      }));
      for (const r of batchResults) {
        for (const item of r.items) {
          const row = mapToRow(item, operation);
          if (row) opResults.push(row);
        }
      }
    }
    logger.info(`  [${operation}] 완료: ${opResults.length}건`);
    return opResults;
  }

  // 3 op 병렬 (Promise.all)
  const opResults = await Promise.all(NTCE_OPS.map(op => fetchOp(op).catch(e => {
    if (e instanceof G2BCode07Error) throw e; // 한도 도달은 호출자 전파
    logger.error(`  [${op}] op 전체 실패: ${(e as Error).message}`);
    return [];
  })));
  for (const opR of opResults) results.push(...opR);

  logger.info(`G2B 공고 수집 완료: ${results.length}건`);
  return results;
}
