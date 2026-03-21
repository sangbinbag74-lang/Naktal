/**
 * G2B(나라장터) 업체정보 / 계약실적 API 클라이언트
 *
 * ⚠️ 오퍼레이션명은 data.go.kr에서 확인 후 환경변수에 등록:
 *   G2B_USR_OP   — UsrInfoService02 오퍼레이션명 (예: getUsrInfoServc02)
 *   G2B_CNTRCT_OP — CntrctInfoService 오퍼레이션명 (예: getCntrctInfoListServc)
 */

const USR_BASE    = "https://apis.data.go.kr/1230000/ao/UsrInfoService02";
const CNTRCT_BASE = "https://apis.data.go.kr/1230000/ao/CntrctInfoService";

export interface G2BLicense {
  licenseType: string;  // 면허업종 (토목공사업 등)
  licenseNo:   string;  // 면허번호
  registAt:    string;  // 등록일 YYYYMMDD
  gradeNm:     string;  // 등급 (특급/1급/2급 등)
  validYn:     string;  // 유효여부 Y/N
}

export interface G2BCompanyInfo {
  bizName:       string;
  ceoName:       string;
  address:       string;
  establishedAt: string;      // YYYYMMDD
  employeeCount: number;
  capitalAmount: number;      // 원
  licenses:      G2BLicense[];
}

export interface G2BContract {
  projectName:    string;
  client:         string;
  amount:         string;     // 숫자 문자열 (원)
  contractDate:   string;     // YYYYMMDD
  completionDate: string;     // YYYYMMDD
  category:       string;
  year:           number;
}

// ─── 내부 유틸 ────────────────────────────────────────────────────────────────

function apiKey(): string {
  const k = process.env.G2B_API_KEY;
  if (!k) throw new Error("G2B_API_KEY 누락");
  return k;
}

function parseItems(items: unknown): Record<string, string>[] {
  if (!items || typeof items === "string") return [];
  if (Array.isArray(items)) return items as Record<string, string>[];
  if (typeof items === "object" && "item" in items) {
    const item = (items as { item: unknown }).item;
    if (!item) return [];
    return Array.isArray(item)
      ? (item as Record<string, string>[])
      : [item as Record<string, string>];
  }
  return [];
}

function parseLicenses(item: Record<string, string>): G2BLicense[] {
  // ⚠️ 실제 API 응답 구조 확인 후 수정 필요
  // 면허 목록이 별도 배열로 오는 경우를 위한 플레이스홀더
  const licenseRaw = item["licnsList"] ?? item["licenseList"] ?? null;
  if (!licenseRaw) {
    // 단일 면허 필드로 반환될 수 있음
    const licenseType = item["indutyNm"] ?? item["lcnsDivNm"] ?? "";
    if (!licenseType) return [];
    return [{
      licenseType,
      licenseNo:  item["lcnsNo"]      ?? item["licenseNo"]  ?? "",
      registAt:   item["registDt"]    ?? item["registAt"]   ?? "",
      gradeNm:    item["gradeNm"]     ?? "",
      validYn:    item["validYn"]     ?? "Y",
    }];
  }
  const list = Array.isArray(licenseRaw) ? licenseRaw : [licenseRaw];
  return (list as Record<string, string>[]).map((l) => ({
    licenseType: l["indutyNm"]  ?? l["lcnsDivNm"] ?? "",
    licenseNo:   l["lcnsNo"]    ?? l["licenseNo"] ?? "",
    registAt:    l["registDt"]  ?? l["registAt"]  ?? "",
    gradeNm:     l["gradeNm"]   ?? "",
    validYn:     l["validYn"]   ?? "Y",
  }));
}

// ─── 사용자(업체) 정보 조회 ───────────────────────────────────────────────────

export async function fetchG2BCompanyInfo(
  bizNo: string
): Promise<G2BCompanyInfo | null> {
  const opName = process.env.G2B_USR_OP ?? "getUsrInfoServc02";
  const url = new URL(`${USR_BASE}/${opName}`);
  url.searchParams.set("serviceKey", apiKey());
  url.searchParams.set("type",       "json");
  url.searchParams.set("numOfRows",  "1");
  url.searchParams.set("pageNo",     "1");
  // ⚠️ 파라미터명은 실제 API 명세 확인 후 수정 필요
  url.searchParams.set("bizno",      bizNo);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;

  const data = await res.json();
  const body  = data?.response?.body;
  if (!body) return null;

  const items = parseItems(body.items);
  const item  = items[0];
  if (!item) return null;

  return {
    // ⚠️ 필드명은 실제 API 응답 확인 후 수정 필요
    bizName:       item["bizNm"]    ?? item["corpNm"]   ?? "",
    ceoName:       item["rprsvNm"]  ?? item["ceoNm"]    ?? "",
    address:       item["addrNm"]   ?? item["addr"]     ?? "",
    establishedAt: item["estnDt"]   ?? item["foundDt"]  ?? "",
    employeeCount: parseInt(item["emplyCnt"] ?? item["empCnt"] ?? "0", 10),
    capitalAmount: parseInt(
      (item["cptlAmt"] ?? item["capitalAmt"] ?? "0").replace(/[^0-9]/g, ""),
      10
    ),
    licenses: parseLicenses(item),
  };
}

// ─── 계약실적 조회 ───────────────────────────────────────────────────────────

export async function fetchG2BContracts(
  bizNo: string,
  maxPages = 10
): Promise<G2BContract[]> {
  const opName = process.env.G2B_CNTRCT_OP ?? "getCntrctInfoListServc";
  const results: G2BContract[] = [];
  let page = 1;

  while (page <= maxPages) {
    const url = new URL(`${CNTRCT_BASE}/${opName}`);
    url.searchParams.set("serviceKey", apiKey());
    url.searchParams.set("type",       "json");
    url.searchParams.set("numOfRows",  "100");
    url.searchParams.set("pageNo",     String(page));
    // ⚠️ 파라미터명은 실제 API 명세 확인 후 수정 필요
    url.searchParams.set("bizno",      bizNo);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) break;

    const data  = await res.json();
    const body  = data?.response?.body;
    if (!body) break;

    const items = parseItems(body.items);
    if (items.length === 0) break;

    for (const item of items) {
      // ⚠️ 필드명은 실제 API 응답 확인 후 수정 필요
      const completionDate = item["cmpltDt"] ?? item["complDt"] ?? "";
      results.push({
        projectName:    item["cntrctNm"]    ?? item["prjctNm"]   ?? "",
        client:         item["dminsttNm"]   ?? item["orgnNm"]    ?? "",
        amount:         (item["cntrctAmt"]  ?? item["contractAmt"] ?? "0").replace(/[^0-9]/g, ""),
        contractDate:   item["cntrctDt"]    ?? item["contractDt"] ?? "",
        completionDate,
        category:       item["indutyNm"]    ?? item["ctgryNm"]   ?? "",
        year:           parseInt(completionDate.slice(0, 4), 10) || new Date().getFullYear(),
      });
    }

    const totalCount = body.totalCount ?? 0;
    if (page * 100 >= totalCount) break;
    page++;
    await new Promise((r) => setTimeout(r, 300));
  }

  return results;
}
