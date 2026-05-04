/**
 * G2B(나라장터) OpenAPI 기본 클라이언트
 * EndPoint: https://apis.data.go.kr/1230000/ad/BidPublicInfoService
 */

export interface G2BAnnouncement {
  bidNtceNo: string;       // 입찰공고번호 (= konepsId)
  bidNtceNm: string;       // 입찰공고명
  ntceInsttNm: string;     // 공고기관명
  demInsttNm: string;      // 수요기관명
  asignBdgtAmt: string;    // 배정예산액
  presmptPrce: string;     // 추정가격
  bidClseDt: string;       // 입찰마감일시 YYYYMMDDHHMM
  bidNtceDt: string;       // 공고일시 YYYYMMDDHHMM
  ntceKindNm: string;      // 공고종류명 (등록공고 / 재공고 / 취소공고 / 변경공고)
  cntrctMthdNm: string;    // 계약방법명
  indutyCtgryNm: string;   // 업종카테고리명 (G2B API 미반환 — 항상 빈값)
  pubPrcrmntLrgClsfcNm: string; // 공공조달분류 대분류 (시설공사 / 물품 / 기술용역 등)
  pubPrcrmntMidClsfcNm: string; // 공공조달분류 중분류 (토목공사 / 건축공사 / 전기공사 등)
  ntceInsttAddr: string;   // 공고기관주소 (지역 추출용)
  sucsfbidLwltRate: string;// 낙찰하한율
  rbidPermsnYn: string;    // 재입찰허용여부
  [key: string]: string;
}

export interface G2BBidResult {
  bidNtceNo: string;       // 입찰공고번호 (= annId)
  bidNtceNm: string;       // 입찰공고명
  sucsfbidAmt: string;     // 낙찰금액
  sucsfbidRate: string;    // 낙찰률 (소수점 포함)
  totPrtcptCo: string;     // 총참가사수 (구 필드, 하위호환)
  prtcptCnum: string;      // 참여업체수 (ScsbidInfoService 필드)
  sucsfbidCorpNm: string;  // 낙찰업체명
  bidwinnrNm: string;      // 낙찰업체명 (ScsbidInfoService 필드)
  opengDt: string;         // 개찰일시 YYYYMMDDHHMM
  rlOpengDt: string;       // 실개찰일시 (ScsbidInfoService 필드)
  ntceInsttNm: string;     // 공고기관명
  dminsttNm: string;       // 수요기관명 (ScsbidInfoService 필드)
  [key: string]: string;
}

interface G2BBody<T> {
  items: { item: T[] | T } | T[] | "";
  numOfRows: number;
  pageNo: number;
  totalCount: number;
}

/**
 * G2B resultCode "07" (입력범위값 초과) — 다음 중 하나:
 * 1) 진짜 페이지 끝 (정상 종료)
 * 2) 일일 한도 초과
 * 3) 일시 장애
 * 호출자가 (totalCount=0 + pageNo=1) 동시일 때만 진짜 끝이라고 판단할 수 있도록
 * pageNo와 함께 throw. fetchAnnouncements/fetchBidResults가 catch 후 분기.
 */
export class G2BCode07Error extends Error {
  constructor(public readonly pageNo: number, public readonly operation: string) {
    super(`G2B resultCode 07 (page=${pageNo}, op=${operation})`);
    this.name = "G2BCode07Error";
  }
}

interface G2BResponse<T> {
  response: {
    header: { resultCode: string; resultMsg: string };
    body: G2BBody<T>;
  };
}

const BASE_URL = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";
const SCSBID_BASE = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";

// 공고 타입별 엔드포인트 (낙찰결과 SCSBID_OPS와 동일 구조)
export const NTCE_OPS = [
  "getBidPblancListInfoServc",    // 용역
  "getBidPblancListInfoCnstwk",   // 시설공사
  "getBidPblancListInfoThng",     // 물품
] as const;
export type NtceOp = typeof NTCE_OPS[number];

const SCSBID_OPS = [
  "getScsbidListSttusThng",      // 물품
  "getScsbidListSttusCnstwk",    // 시설공사
  "getScsbidListSttusServc",     // 용역
  "getScsbidListSttusFrgcpt",    // 외자
] as const;

function getApiKey(): string {
  const key = process.env.G2B_API_KEY;
  if (!key) throw new Error("G2B_API_KEY 환경변수 누락");
  return key;
}

/** G2B API 응답 items 정규화 (단일 객체 / 배열 / 빈 문자열 처리) */
function parseItems<T>(items: G2BBody<T>["items"]): T[] {
  if (!items || typeof items === "string") return [];
  if (Array.isArray(items)) return items;
  if (typeof items === "object" && "item" in items) {
    const item = (items as { item: T[] | T }).item;
    return Array.isArray(item) ? item : [item];
  }
  return [];
}

/** 입찰공고 목록 조회 (operation으로 용역/시설공사/물품 구분) */
export async function fetchAnnouncementPage(params: {
  pageNo: number;
  numOfRows: number;
  inqryDiv?: "1" | "2"; // 1=공고일시 기준, 2=마감일시 기준
  inqryBgnDt: string;   // YYYYMMDD0000
  inqryEndDt: string;   // YYYYMMDD2359
  operation?: NtceOp;   // 기본: getBidPblancListInfoServc (용역)
}): Promise<{ items: G2BAnnouncement[]; totalCount: number }> {
  const op = params.operation ?? NTCE_OPS[0];
  const url = new URL(`${BASE_URL}/${op}`);
  url.searchParams.set("serviceKey", getApiKey());
  url.searchParams.set("numOfRows", String(params.numOfRows));
  url.searchParams.set("pageNo", String(params.pageNo));
  url.searchParams.set("type", "json");
  url.searchParams.set("inqryDiv", params.inqryDiv ?? "1");
  url.searchParams.set("inqryBgnDt", params.inqryBgnDt);
  url.searchParams.set("inqryEndDt", params.inqryEndDt);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`G2B 공고 API 오류: ${res.status} ${res.statusText}`);

  const data = (await res.json()) as G2BResponse<G2BAnnouncement>;
  if (!data?.response) {
    const altErr = (data as any)?.["nkoneps.com.response.ResponseError"];
    if (altErr?.header?.resultCode === "07") throw new G2BCode07Error(params.pageNo, op);
    throw new Error(`G2B 공고 API 비정상 응답: ${JSON.stringify(data).slice(0, 300)}`);
  }
  const { header, body } = data.response;

  if (header.resultCode === "07") throw new G2BCode07Error(params.pageNo, op);
  if (header.resultCode !== "00")
    throw new Error(`G2B API 오류 코드: ${header.resultCode} - ${header.resultMsg}`);

  return { items: parseItems(body.items), totalCount: body.totalCount ?? 0 };
}

/** 낙찰결과 단일 operation 페이지 조회 (ScsbidInfoService) */
export async function fetchBidResultPage(params: {
  pageNo: number;
  numOfRows: number;
  inqryBgnDt: string; // YYYYMMDD0000
  inqryEndDt: string; // YYYYMMDD2359
  operation?: string; // 기본: getScsbidListSttusThng
}): Promise<{ items: G2BBidResult[]; totalCount: number }> {
  const op = params.operation ?? SCSBID_OPS[0];
  const url = new URL(`${SCSBID_BASE}/${op}`);
  url.searchParams.set("serviceKey", getApiKey());
  url.searchParams.set("numOfRows", String(params.numOfRows));
  url.searchParams.set("pageNo", String(params.pageNo));
  url.searchParams.set("type", "json");
  url.searchParams.set("inqryDiv", "1");
  url.searchParams.set("inqryBgnDt", params.inqryBgnDt);
  url.searchParams.set("inqryEndDt", params.inqryEndDt);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`G2B 낙찰결과 API 오류: ${res.status} ${res.statusText}`);

  const data = (await res.json()) as G2BResponse<G2BBidResult>;
  if (!data?.response) {
    const altErr = (data as any)?.["nkoneps.com.response.ResponseError"];
    if (altErr?.header?.resultCode === "07") throw new G2BCode07Error(params.pageNo, op);
    throw new Error(`G2B 낙찰결과 API 비정상 응답: ${JSON.stringify(data).slice(0, 300)}`);
  }
  const { header, body } = data.response;

  if (header.resultCode === "07") throw new G2BCode07Error(params.pageNo, op);
  if (header.resultCode !== "00")
    throw new Error(`G2B API 오류 코드: ${header.resultCode} - ${header.resultMsg}`);

  return { items: parseItems(body.items), totalCount: body.totalCount ?? 0 };
}

/** 낙찰결과 전체 조회 — 4개 카테고리(물품/시설공사/용역/외자) 합산 */
export async function fetchAllBidResultPages(params: {
  pageNo: number;
  numOfRows: number;
  inqryBgnDt: string;
  inqryEndDt: string;
  operationIndex: number; // 0~3
}): Promise<{ items: G2BBidResult[]; totalCount: number }> {
  const op = SCSBID_OPS[params.operationIndex] ?? SCSBID_OPS[0];
  return fetchBidResultPage({ ...params, operation: op });
}
