/**
 * 나라장터 G2B OpenAPI 클라이언트 (Next.js / Edge 환경 호환)
 * apps/crawler와 별도로 순수 fetch 기반으로 구현
 */

const G2B_BASE     = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";
const G2B_RESULT_BASE = "https://apis.data.go.kr/1230000/ad/BidResultInfoService";

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

function apiKey(): string {
  const k = process.env.G2B_API_KEY;
  if (!k) throw new Error("G2B_API_KEY 환경변수 누락");
  return k;
}

// ─── 공고 목록 페이지 조회 ────────────────────────────────────────────────────
export async function g2bFetchAnnouncementPage(params: {
  pageNo: number;
  numOfRows: number;
  inqryBgnDt: string; // YYYYMMDD0000
  inqryEndDt: string; // YYYYMMDD2359
  inqryDiv?: "1" | "2";
}): Promise<{ items: G2BAnnouncement[]; totalCount: number }> {
  const url = new URL(`${G2B_BASE}/getBidPblancListInfoServc`);
  url.searchParams.set("serviceKey", apiKey());
  url.searchParams.set("numOfRows", String(params.numOfRows));
  url.searchParams.set("pageNo", String(params.pageNo));
  url.searchParams.set("type", "json");
  url.searchParams.set("inqryDiv", params.inqryDiv ?? "1");
  url.searchParams.set("inqryBgnDt", params.inqryBgnDt);
  url.searchParams.set("inqryEndDt", params.inqryEndDt);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`G2B 공고 API ${res.status}`);

  const data = await res.json() as {
    response: { header: { resultCode: string; resultMsg: string }; body: { items: unknown; totalCount: number } };
  };

  if (data.response.header.resultCode !== "00") {
    throw new Error(`G2B 오류: ${data.response.header.resultMsg}`);
  }

  return {
    items: parseItems<G2BAnnouncement>(data.response.body.items),
    totalCount: data.response.body.totalCount ?? 0,
  };
}

// ─── 낙찰결과 페이지 조회 ─────────────────────────────────────────────────────
export async function g2bFetchBidResultPage(params: {
  pageNo: number;
  numOfRows: number;
  inqryBgnDt: string;
  inqryEndDt: string;
}): Promise<{ items: G2BBidResult[]; totalCount: number }> {
  const url = new URL(`${G2B_RESULT_BASE}/getBidResultListInfoServc`);
  url.searchParams.set("serviceKey", apiKey());
  url.searchParams.set("numOfRows", String(params.numOfRows));
  url.searchParams.set("pageNo", String(params.pageNo));
  url.searchParams.set("type", "json");
  url.searchParams.set("inqryBgnDt", params.inqryBgnDt);
  url.searchParams.set("inqryEndDt", params.inqryEndDt);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`G2B 낙찰결과 API ${res.status}`);

  const data = await res.json() as {
    response: { header: { resultCode: string; resultMsg: string }; body: { items: unknown; totalCount: number } };
  };

  if (data.response.header.resultCode !== "00") {
    throw new Error(`G2B 오류: ${data.response.header.resultMsg}`);
  }

  return {
    items: parseItems<G2BBidResult>(data.response.body.items),
    totalCount: data.response.body.totalCount ?? 0,
  };
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
