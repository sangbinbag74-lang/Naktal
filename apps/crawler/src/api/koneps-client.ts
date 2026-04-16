/**
 * 나라장터(KONEPS) 공공데이터포털 API 클라이언트
 * Base: https://apis.data.go.kr/1230000/ad/BidPublicInfoService
 *
 * 제공 메서드:
 *   getBidAnnouncementList   — 입찰공고 목록 (페이지)
 *   getBidAnnouncementDetail — 입찰공고 상세
 *   getBidResultList         — 낙찰결과 목록 (페이지)
 *   getBidResultDetail       — 낙찰결과 상세
 *   getBidParticipants       — 입찰 참여 현황
 */

const BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";

function apiKey(): string {
  const k = process.env.KONEPS_API_KEY ?? process.env.G2B_API_KEY;
  if (!k) throw new Error("KONEPS_API_KEY (또는 G2B_API_KEY) 환경변수 누락");
  return k;
}

// ─── 공통 응답 파싱 ───────────────────────────────────────────────────────────

interface KonepsBody<T> {
  items: { item: T | T[] } | T[] | "";
  numOfRows: number;
  pageNo: number;
  totalCount: number;
}

interface KonepsResponse<T> {
  response: {
    header: { resultCode: string; resultMsg: string };
    body: KonepsBody<T>;
  };
}

function parseItems<T>(body: KonepsBody<T>): T[] {
  const items = body.items;
  if (!items || items === "") return [];
  if (Array.isArray(items)) return items;
  if (typeof items === "object" && "item" in items) {
    const item = (items as { item: T | T[] }).item;
    return Array.isArray(item) ? item : [item];
  }
  return [];
}

async function get<T>(
  endpoint: string,
  params: Record<string, string>,
): Promise<{ items: T[]; totalCount: number }> {
  const url = new URL(`${BASE}/${endpoint}`);
  url.searchParams.set("serviceKey", apiKey());
  url.searchParams.set("type", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`KONEPS API 오류: ${res.status} ${endpoint}`);

  const data = (await res.json()) as KonepsResponse<T>;
  const { header, body } = data.response;
  if (header.resultCode !== "00")
    throw new Error(`KONEPS API 코드 ${header.resultCode}: ${header.resultMsg}`);

  return { items: parseItems(body), totalCount: body.totalCount ?? 0 };
}

// ─── 타입 정의 ────────────────────────────────────────────────────────────────

export interface KonepsBidAnnouncement {
  bidNtceNo: string;       // 입찰공고번호
  bidNtceNm: string;       // 공고명
  ntceInsttNm: string;     // 공고기관
  demInsttNm: string;      // 수요기관
  asignBdgtAmt: string;    // 배정예산액 (원)
  presmptPrce: string;     // 추정가격 (원)
  bidClseDt: string;       // 마감일시 YYYYMMDDHHMM
  bidNtceDt: string;       // 공고일시 YYYYMMDDHHMM
  ntceKindNm: string;      // 공고종류 (시설공사/물품/용역)
  cntrctMthdNm: string;    // 계약방법
  indutyCtgryNm: string;   // 업종카테고리
  ntceInsttAddr: string;   // 공고기관주소
  sucsfbidLwltRate: string;// 낙찰하한율
  rbidPermsnYn: string;    // 재입찰허용
  [key: string]: string;
}

export interface KonepsBidResultDetail {
  bidNtceNo: string;       // 입찰공고번호
  bidNtceNm: string;       // 공고명
  sucsfbidAmt: string;     // 낙찰금액
  sucsfbidRate: string;    // 낙찰률 (투찰률%)
  totPrtcptCo: string;     // 총참가사수
  sucsfbidCorpNm: string;  // 낙찰업체명
  sucsfbidBizno: string;   // 낙찰업체사업자번호
  opengDt: string;         // 개찰일시 YYYYMMDDHHMM
  ntceInsttNm: string;     // 공고기관
  presmptPrce: string;     // 추정가격
  indutyCtgryNm: string;   // 업종카테고리
  ntceInsttAddr: string;   // 주소(지역)
  [key: string]: string;
}

export interface KonepsParticipant {
  bidNtceNo: string;       // 입찰공고번호
  bidNtceOrd: string;      // 입찰차수
  prtcptCorpNm: string;    // 참여업체명
  prtcptBizno: string;     // 참여업체사업자번호
  prtcptAmt: string;       // 투찰금액
  prtcptRate: string;      // 투찰률
  opengRslt: string;       // 개찰결과 (낙찰/탈락)
  [key: string]: string;
}

// ─── 공개 메서드 ──────────────────────────────────────────────────────────────

/** 입찰공고 목록 조회 */
export async function getBidAnnouncementList(params: {
  pageNo?: number;
  numOfRows?: number;
  inqryBgnDt: string;  // YYYYMMDD0000
  inqryEndDt: string;  // YYYYMMDD2359
  inqryDiv?: "1" | "2"; // 1=공고일기준(기본) 2=마감일기준
}): Promise<{ items: KonepsBidAnnouncement[]; totalCount: number }> {
  return get<KonepsBidAnnouncement>("getBidPblancListInfoServc", {
    pageNo: String(params.pageNo ?? 1),
    numOfRows: String(params.numOfRows ?? 100),
    inqryDiv: params.inqryDiv ?? "1",
    inqryBgnDt: params.inqryBgnDt,
    inqryEndDt: params.inqryEndDt,
  });
}

/** 입찰공고 상세 조회 */
export async function getBidAnnouncementDetail(
  bidNtceNo: string,
  bidNtceOrd = "00",
): Promise<KonepsBidAnnouncement | null> {
  const { items } = await get<KonepsBidAnnouncement>(
    "getBidPblancListInfoCnstwkServc",
    { bidNtceNo, bidNtceOrd },
  );
  return items[0] ?? null;
}

/** 낙찰결과 목록 조회 */
export async function getBidResultList(params: {
  pageNo?: number;
  numOfRows?: number;
  inqryBgnDt: string; // YYYYMMDD0000
  inqryEndDt: string; // YYYYMMDD2359
}): Promise<{ items: KonepsBidResultDetail[]; totalCount: number }> {
  return get<KonepsBidResultDetail>("getSuccBidInquireInfoServc", {
    pageNo: String(params.pageNo ?? 1),
    numOfRows: String(params.numOfRows ?? 100),
    inqryBgnDt: params.inqryBgnDt,
    inqryEndDt: params.inqryEndDt,
  });
}

/** 낙찰결과 상세 조회 */
export async function getBidResultDetail(
  bidNtceNo: string,
  bidNtceOrd = "00",
): Promise<KonepsBidResultDetail | null> {
  const { items } = await get<KonepsBidResultDetail>(
    "getSuccBidInquireInfoDetail",
    { bidNtceNo, bidNtceOrd },
  );
  return items[0] ?? null;
}

/**
 * 입찰 참여 현황 조회 (CORE 2 실시간 참여자 수)
 * ⚠️  나라장터 OpenAPI는 마감 전 참여자 수를 제공하지 않음 → 개찰 후 데이터만 제공
 *     실시간 참여 현황은 나라장터 웹사이트 크롤링이 필요함 (scrapers/realtime-participants.ts)
 */
export async function getBidParticipants(
  bidNtceNo: string,
  bidNtceOrd = "00",
): Promise<{ items: KonepsParticipant[]; totalCount: number }> {
  return get<KonepsParticipant>("getBidPrtcptInfoServc", {
    bidNtceNo,
    bidNtceOrd,
  });
}
