/**
 * 나라장터 G2B OpenAPI 클라이언트 (Next.js / Edge 환경 호환)
 * apps/crawler와 별도로 순수 fetch 기반으로 구현
 */

const G2B_BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";
const SCSBID_BASE = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";
const SCSBID_OPS = [
  "getScsbidListSttusThng",
  "getScsbidListSttusCnstwk",
  "getScsbidListSttusServc",
  "getScsbidListSttusFrgcpt",
];

export interface G2BAnnouncement {
  bidNtceNo: string;
  bidNtceNm: string;
  ntceInsttNm: string;
  demInsttNm: string;
  asignBdgtAmt: string;
  presmptPrce: string;
  bidClseDt: string;
  bidNtceDt: string;
  ntceKindNm: string;
  cntrctMthdNm: string;
  indutyCtgryNm: string;
  ntceInsttAddr: string;
  sucsfbidLwltRate: string;
  [key: string]: string;
}

export interface G2BBidResult {
  bidNtceNo: string;
  bidNtceNm: string;
  sucsfbidAmt: string;
  sucsfbidRate: string;
  totPrtcptCo: string;
  sucsfbidCorpNm: string;
  opengDt: string;
  ntceInsttNm: string;
  [key: string]: string;
}

// ─── 내부 유틸 ────────────────────────────────────────────────────────────────
function parseItems<T>(items: unknown): T[] {
  if (!items || items === "") return [];
  if (Array.isArray(items)) return items as T[];
  if (typeof items === "object" && items !== null && "item" in items) {
    const item = (items as { item: unknown }).item;
    return Array.isArray(item) ? (item as T[]) : [item as T];
  }
  return [];
}

function announcementApiKey(): string {
  const k = process.env.G2B_ANNOUNCE_KEY ?? process.env.G2B_API_KEY;
  if (!k) throw new Error("G2B_ANNOUNCE_KEY 또는 G2B_API_KEY 환경변수 누락");
  return k;
}

function bidResultApiKey(): string {
  const k = process.env.G2B_API_KEY;
  if (!k) throw new Error("G2B_API_KEY 환경변수 누락");
  return k;
}

// ─── 공고 목록 페이지 조회 ────────────────────────────────────────────────────
const NTCE_OPS = [
  "getBidPblancListInfoServc",    // 용역
  "getBidPblancListInfoCnstwk",   // 시설공사
  "getBidPblancListInfoThng",     // 물품
] as const;

export async function g2bFetchAnnouncementPage(params: {
  pageNo: number;
  numOfRows: number;
  inqryBgnDt: string; // YYYYMMDD0000
  inqryEndDt: string; // YYYYMMDD2359
  inqryDiv?: "1" | "2";
  operation?: typeof NTCE_OPS[number];
}): Promise<{ items: G2BAnnouncement[]; totalCount: number }> {
  const op = params.operation ?? NTCE_OPS[0];
  const url = new URL(`${G2B_BASE}/${op}`);
  url.searchParams.set("serviceKey", announcementApiKey());
  url.searchParams.set("numOfRows", String(params.numOfRows));
  url.searchParams.set("pageNo", String(params.pageNo));
  url.searchParams.set("type", "json");
  url.searchParams.set("inqryDiv", params.inqryDiv ?? "1");
  url.searchParams.set("inqryBgnDt", params.inqryBgnDt);
  url.searchParams.set("inqryEndDt", params.inqryEndDt);

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(url.toString(), { next: { revalidate: 0 }, signal: controller.signal });
  } finally {
    clearTimeout(tid);
  }
  if (!res!.ok) throw new Error(`G2B 공고 API ${res!.status}`);

  const data = await res.json() as {
    response?: { header: { resultCode: string; resultMsg: string }; body: { items: unknown; totalCount: number } };
  };

  if (!data.response) {
    const altErr = (data as any)?.["nkoneps.com.response.ResponseError"];
    if (altErr?.header?.resultCode === "07") return { items: [], totalCount: 0 };
    throw new Error(`G2B 공고 비정상 응답: ${JSON.stringify(data).slice(0, 200)}`);
  }
  if (data.response.header.resultCode !== "00") {
    throw new Error(`G2B 오류: ${data.response.header.resultMsg}`);
  }

  return {
    items: parseItems<G2BAnnouncement>(data.response.body.items),
    totalCount: data.response.body.totalCount ?? 0,
  };
}

// ─── 공고 단건 조회 (bidNtceNo 기준) ─────────────────────────────────────────
// G2B API는 bidNtceNo 필터를 지원하지 않으므로 최근 3일 전체 페이지 병렬 조회 후 필터
export async function g2bFetchAnnouncementByNo(bidNtceNo: string): Promise<G2BAnnouncement | null> {
  const now = Date.now();
  const inqryBgnDt = toYMD(new Date(now - 3 * 86400000)) + "0000";
  const inqryEndDt = toYMD(new Date()) + "2359";

  // 1페이지로 totalCount 먼저 확인
  const first = await g2bFetchAnnouncementPage({ pageNo: 1, numOfRows: 100, inqryBgnDt, inqryEndDt });
  const found1 = first.items.find(i => i.bidNtceNo === bidNtceNo);
  if (found1) return found1;

  const totalPages = Math.ceil(first.totalCount / 100);
  if (totalPages <= 1) return null;

  // 나머지 페이지 병렬 조회 (최대 30페이지)
  const pageNums = Array.from({ length: Math.min(totalPages - 1, 29) }, (_, i) => i + 2);
  const results = await Promise.all(
    pageNums.map(p =>
      g2bFetchAnnouncementPage({ pageNo: p, numOfRows: 100, inqryBgnDt, inqryEndDt })
        .catch(() => ({ items: [] as G2BAnnouncement[], totalCount: 0 }))
    )
  );
  for (const r of results) {
    const f = r.items.find(i => i.bidNtceNo === bidNtceNo);
    if (f) return f;
  }
  return null;
}

// ─── 낙찰결과 페이지 조회 (ScsbidInfoService, 단일 카테고리) ─────────────────
export async function g2bFetchBidResultPage(params: {
  pageNo: number;
  numOfRows: number;
  inqryBgnDt: string; // YYYYMMDD0000
  inqryEndDt: string; // YYYYMMDD2359
  operation?: string; // 기본: getScsbidListSttusThng
}): Promise<{ items: G2BBidResult[]; totalCount: number }> {
  const op = params.operation ?? SCSBID_OPS[0];
  const url = new URL(`${SCSBID_BASE}/${op}`);
  url.searchParams.set("serviceKey", bidResultApiKey());
  url.searchParams.set("numOfRows", String(params.numOfRows));
  url.searchParams.set("pageNo", String(params.pageNo));
  url.searchParams.set("type", "json");
  url.searchParams.set("inqryDiv", "1");
  url.searchParams.set("inqryBgnDt", params.inqryBgnDt);
  url.searchParams.set("inqryEndDt", params.inqryEndDt);

  const controller2 = new AbortController();
  const tid2 = setTimeout(() => controller2.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(url.toString(), { next: { revalidate: 0 }, signal: controller2.signal });
  } finally {
    clearTimeout(tid2);
  }
  if (!res!.ok) throw new Error(`G2B 낙찰결과 API ${res!.status}`);

  const data = await res.json() as {
    response?: { header: { resultCode: string; resultMsg: string }; body: { items: unknown; totalCount: number } };
  };

  if (!data.response) {
    const altErr = (data as any)?.["nkoneps.com.response.ResponseError"];
    if (altErr?.header?.resultCode === "07") return { items: [], totalCount: 0 };
    throw new Error(`G2B 낙찰결과 비정상 응답: ${JSON.stringify(data).slice(0, 200)}`);
  }
  if (data.response.header.resultCode !== "00") {
    throw new Error(`G2B 오류: ${data.response.header.resultMsg}`);
  }

  return {
    items: parseItems<G2BBidResult>(data.response.body.items),
    totalCount: data.response.body.totalCount ?? 0,
  };
}

/** 낙찰결과 4개 카테고리 전체 조회 (cron용) */
export async function g2bFetchAllBidResults(
  inqryBgnDt: string, inqryEndDt: string, numOfRows = 100
): Promise<G2BBidResult[]> {
  const all: G2BBidResult[] = [];
  for (const op of SCSBID_OPS) {
    let page = 1;
    while (true) {
      const { items, totalCount } = await g2bFetchBidResultPage({
        pageNo: page, numOfRows, inqryBgnDt, inqryEndDt, operation: op,
      });
      if (items.length === 0) break;
      all.push(...items);
      if (page * numOfRows >= totalCount) break;
      page++;
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return all;
}

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────
const REGION_MAP: [string, string][] = [
  ["서울", "서울"], ["부산", "부산"], ["대구", "대구"], ["인천", "인천"],
  ["광주", "광주"], ["대전", "대전"], ["울산", "울산"], ["세종", "세종"],
  ["경기", "경기"], ["강원", "강원"], ["충북", "충북"], ["충남", "충남"],
  ["전북", "전북"], ["전남", "전남"], ["경북", "경북"], ["경남", "경남"],
  ["제주", "제주"],
];

export function g2bExtractRegion(addr: string): string {
  for (const [p, l] of REGION_MAP) if (addr?.startsWith(p)) return l;
  return addr?.slice(0, 2) ?? "";
}

export function g2bParseDate(raw: string): string | null {
  if (!raw || raw.length < 8) return null;
  // "YYYY-MM-DD HH:MM:SS" 또는 "YYYY-MM-DD HH:MM" 형식 처리
  if (raw.includes("-")) {
    const dt = new Date(raw.replace(" ", "T") + (raw.length <= 16 ? ":00+09:00" : "+09:00"));
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  // "YYYYMMDDHHMMSS" 또는 "YYYYMMDDHHMM" 형식 처리
  const y = raw.slice(0, 4), mo = raw.slice(4, 6), d = raw.slice(6, 8);
  const hh = raw.slice(8, 10) || "00", mm = raw.slice(10, 12) || "00";
  const dt = new Date(`${y}-${mo}-${d}T${hh}:${mm}:00+09:00`);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

/** YYYYMMDD 문자열 반환 */
export function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** n일 전 Date 반환 */
export function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
