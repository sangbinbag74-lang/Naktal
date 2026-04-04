import Decimal from "decimal.js";
import { fetchAnnouncementPage, NTCE_OPS, type G2BAnnouncement } from "./g2b-client";
import type { AnnouncementRow } from "../parsers/announcement";
import { logger } from "../utils/logger";

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

// ─── mainCnsttyNm → UI category (Cnstwk 전용) ────────────────────────────────
const MAIN_CNSTWK_MAP: Record<string, string> = {
  "토목공사업":                               "토목공사",
  "산림사업법인(산림토목)":                   "토목공사",
  "수중ㆍ준설공사업":                         "토목공사",
  "철도ㆍ궤도공사업":                         "토목공사",
  "지하수개발·이용시공업":                    "토목공사",
  "(제주지역한정)지하수개발,이용시공업":      "토목공사",
  "전문광해방지사업(토양개량·복원및정화사업)":"토목공사",
  "토양정화업":                               "토목공사",
  "항만운송관련사업(선박수리업)":             "토목공사",
  "건축공사업":                               "건축공사",
  "조경공사업":                               "조경공사",
  "조경식재ㆍ시설물공사업":                   "조경공사",
  "산림사업법인(숲가꾸기 및 병해충방제)":     "조경공사",
  "산림사업법인(숲길 조성,관리)":             "조경공사",
  "산림사업법인(자연휴양림등 조성)":          "조경공사",
  "산림사업법인(도시숲등 조성, 관리)":        "조경공사",
  "국유림영림단":                             "조경공사",
  "산림조합(지역조합)":                       "조경공사",
  "나무병원(1종)":                            "조경공사",
  "전문국가유산수리업(조경업)":               "조경공사",
  "전기공사업":                               "전기공사",
  "정보통신공사업":                           "통신공사",
  "전문소방시설공사업":                       "소방시설공사",
  "일반소방시설공사업(기계)":                 "소방시설공사",
  "일반소방시설공사업(전기)":                 "소방시설공사",
  "전문소방공사감리업":                       "소방시설공사",
  "기계설비ㆍ가스공사업":                     "기계설비공사",
  "가스난방공사업":                           "기계설비공사",
  "산업·환경설비공사업":                      "기계설비공사",
  "환경전문공사업(대기분야)":                 "기계설비공사",
  "환경전문공사업(수질분야)":                 "기계설비공사",
  "전문광해방지사업(먼지날림,광연및소음·진동방지사업)": "기계설비공사",
  "전문광해방지사업(오염수질의개선사업)":     "기계설비공사",
  "가축분뇨처리시설설계ㆍ시공업":             "기계설비공사",
  "지반조성ㆍ포장공사업":                     "지반조성포장공사",
  "실내건축공사업":                           "실내건축공사",
  "금속창호ㆍ지붕건축물조립공사업":           "실내건축공사",
  "철근ㆍ콘크리트공사업":                     "철근콘크리트공사",
  "구조물해체ㆍ비계공사업":                   "구조물해체비계공사",
  "석면해체.제거업":                          "구조물해체비계공사",
  "상ㆍ하수도설비공사업":                     "상하수도설비공사",
  "철강구조물공사업":                         "철강재설치공사",
  "승강기ㆍ삭도공사업":                       "삭도승강기기계설비공사",
  "도장ㆍ습식ㆍ방수ㆍ석공사업":               "도장습식방수석공사",
  "종합국가유산수리업(보수단청업)":           "문화재수리공사",
  "전문국가유산수리업(보존과학업)":           "문화재수리공사",
  "전문국가유산수리업(식물보호업)":           "문화재수리공사",
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
    const region   = extractRegion(item.ntceInsttAddr || "");

    const rawJson: Record<string, string> = {};
    for (const [k, v] of Object.entries(item)) rawJson[k] = String(v ?? "");

    return {
      konepsId,
      title,
      orgName,
      budget: BigInt(budgetNum),
      deadline,
      category,
      region,
      rawJson,
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
