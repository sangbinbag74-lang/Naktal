/**
 * G2B(나라장터) 업체 면허/업종 정보 API 클라이언트
 *
 * 현재 키로 접근 가능한 오퍼레이션:
 *   getPrcrmntCorpIndstrytyInfo02 — 조달업체 업종(면허) 정보 조회
 *   - 파라미터: bizno(사업자번호) + inqryDiv=1
 *   - 응답필드: indstrytyNm, indstrytyCd, rgstDt, vldPrdExprtDt, rprsntIndstrytyYn
 *
 * ※ getPrcrmntCorpBasicInfo02(업체 기본정보) — 현재 키로 미승인(HTTP 404)
 * ※ CntrctInfoService(계약실적) — 현재 키로 미승인(HTTP 404)
 *   → data.go.kr에서 해당 서비스 별도 활용신청 필요
 */

const USR_BASE = "https://apis.data.go.kr/1230000/ao/UsrInfoService02";
const USR_OP   = "getPrcrmntCorpIndstrytyInfo02";

export interface G2BLicense {
  licenseType:  string;  // 면허업종명 (indstrytyNm)
  licenseNo:    string;  // 업종코드   (indstrytyCd)
  registAt:     string;  // 등록일     (rgstDt)
  gradeNm:      string;  // 등급       (현재 API에서 미제공, 빈 문자열)
  validYn:      string;  // 유효여부   (vldPrdExprtDt 만료여부로 판단)
  isMain:       boolean; // 대표업종여부 (rprsntIndstrytyYn)
}

export interface G2BCompanyInfo {
  // 현재 키로 접근 가능한 정보만 포함
  licenses: G2BLicense[];
  // 아래는 getPrcrmntCorpBasicInfo02 승인 후 추가 가능
  bizName:       string;
  ceoName:       string;
  address:       string;
  establishedAt: string;
  employeeCount: number;
  capitalAmount: number;
}

export interface G2BContract {
  projectName:    string;
  client:         string;
  amount:         string;
  contractDate:   string;
  completionDate: string;
  category:       string;
  year:           number;
}

// ─── 내부 유틸 ────────────────────────────────────────────────────────────────

function apiKey(): string {
  const k = process.env.G2B_API_KEY;
  if (!k) throw new Error("G2B_API_KEY 누락");
  return k;
}

function parseXmlItems(xml: string): Record<string, string>[] {
  const items: Record<string, string>[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const fieldRegex = /<(\w+)>([\s\S]*?)<\/\1>/g;
    const item: Record<string, string> = {};
    let fMatch;
    while ((fMatch = fieldRegex.exec(block)) !== null) {
      item[fMatch[1]] = fMatch[2].trim();
    }
    items.push(item);
  }
  return items;
}

function parseJsonItems(items: unknown): Record<string, string>[] {
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

function isExpired(vldPrdExprtDt: string): boolean {
  if (!vldPrdExprtDt) return false;
  const exp = new Date(vldPrdExprtDt.replace(" ", "T"));
  return !isNaN(exp.getTime()) && exp < new Date();
}

// ─── 업체 면허/업종 조회 ─────────────────────────────────────────────────────
// getPrcrmntCorpIndstrytyInfo02: bizno + inqryDiv=1

export async function fetchG2BCompanyInfo(
  bizNo: string
): Promise<G2BCompanyInfo | null> {
  const url = new URL(`${USR_BASE}/${USR_OP}`);
  url.searchParams.set("serviceKey", apiKey());
  url.searchParams.set("numOfRows",  "100");
  url.searchParams.set("pageNo",     "1");
  url.searchParams.set("bizno",      bizNo);
  url.searchParams.set("inqryDiv",   "1");
  // JSON 응답이 nkoneps 래퍼로 와서 파싱이 까다로움 → XML 사용
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;

  const text = await res.text();

  // 오류 응답 체크
  if (text.includes("resultCode>08") || text.includes('"resultCode":"08"')) return null;
  if (!text.includes("<totalCount>") && !text.includes('"totalCount"')) return null;

  // totalCount 추출
  const countMatch = text.match(/<totalCount>(\d+)<\/totalCount>/);
  if (!countMatch || countMatch[1] === "0") return null;

  const rawItems = parseXmlItems(text);
  if (rawItems.length === 0) return null;

  const licenses: G2BLicense[] = rawItems.map((item) => ({
    licenseType: item["indstrytyNm"] ?? "",
    licenseNo:   item["indstrytyCd"] ?? "",
    registAt:    (item["rgstDt"] ?? "").replace(/\s.*$/, "").replace(/-/g, ""),
    gradeNm:     item["indstrytyStatsNm"] ?? "",
    validYn:     isExpired(item["vldPrdExprtDt"] ?? "") ? "N" : "Y",
    isMain:      item["rprsntIndstrytyYn"] === "Y",
  })).filter(l => l.licenseType);

  return {
    licenses,
    // 기본정보 API 미승인으로 빈 값
    bizName: "", ceoName: "", address: "",
    establishedAt: "", employeeCount: 0, capitalAmount: 0,
  };
}

// ─── 계약실적 조회 (현재 미승인) ─────────────────────────────────────────────
// CntrctInfoService — data.go.kr에서 별도 활용신청 필요

export async function fetchG2BContracts(
  _bizNo: string
): Promise<G2BContract[]> {
  // CntrctInfoService 키가 승인되지 않아 빈 배열 반환
  // data.go.kr → 조달청_나라장터 계약정보서비스 → 활용신청 후 아래 구현
  return [];
}
