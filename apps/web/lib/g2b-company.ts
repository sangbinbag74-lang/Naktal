/**
 * G2B(나라장터) 업체정보 API 클라이언트
 *
 * 확인된 오퍼레이션 (UsrInfoService02):
 *   getPrcrmntCorpBasicInfo02    — 조달업체 기본정보 조회 (inqryDiv=3 + bizno)
 *   getPrcrmntCorpIndstrytyInfo02 — 조달업체 업종(면허) 조회 (inqryDiv=1 + bizno)
 *
 * CntrctInfoService — 활성화 대기 중 (현재 HTTP 404)
 */

const USR_BASE  = "https://apis.data.go.kr/1230000/ao/UsrInfoService02";
const CNTR_BASE = "https://apis.data.go.kr/1230000/ao/CntrctInfoService";

export interface G2BLicense {
  licenseType: string;  // 면허업종명 (indstrytyNm)
  licenseNo:   string;  // 업종코드   (indstrytyCd)
  registAt:    string;  // 등록일     (rgstDt)
  gradeNm:     string;  // 등급       (indstrytyStatsNm)
  validYn:     string;  // 유효여부
  isMain:      boolean; // 대표업종여부
}

export interface G2BCompanyInfo {
  bizName:       string;  // corpNm
  ceoName:       string;  // ceoNm
  address:       string;  // adrs + dtlAdrs
  establishedAt: string;  // opbizDt → YYYYMMDD
  employeeCount: number;  // emplyeNum
  capitalAmount: number;  // API 미제공, 0
  licenses:      G2BLicense[];
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

/** XML 응답에서 <item> 블록을 파싱 */
function parseXmlItems(xml: string): Record<string, string>[] {
  const items: Record<string, string>[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const fieldRegex = /<(\w+)>([\s\S]*?)<\/\1>/g;
    const item: Record<string, string> = {};
    let f;
    while ((f = fieldRegex.exec(block)) !== null) {
      if (f[1] && f[2] !== undefined) item[f[1]] = f[2].trim();
    }
    items.push(item);
  }
  return items;
}

/** XML totalCount 추출 */
function parseTotalCount(xml: string): number {
  const m = xml.match(/<totalCount>(\d+)<\/totalCount>/);
  return m ? parseInt(m[1], 10) : 0;
}

/** "YYYY-MM-DD HH:MM:SS" → "YYYYMMDD" */
function toYYYYMMDD(raw: string): string {
  if (!raw) return "";
  return raw.slice(0, 10).replace(/-/g, "");
}

/** 만료일이 오늘 이전이면 N */
function validYn(vldPrdExprtDt: string): string {
  if (!vldPrdExprtDt) return "Y";
  const exp = new Date(vldPrdExprtDt.replace(" ", "T"));
  return !isNaN(exp.getTime()) && exp < new Date() ? "N" : "Y";
}

// ─── 조달업체 기본정보 조회 ──────────────────────────────────────────────────
// getPrcrmntCorpBasicInfo02: inqryDiv=3 + bizno

async function fetchBasicInfo(bizNo: string): Promise<Omit<G2BCompanyInfo, "licenses"> | null> {
  const url = new URL(`${USR_BASE}/getPrcrmntCorpBasicInfo02`);
  url.searchParams.set("serviceKey", apiKey());
  url.searchParams.set("numOfRows",  "1");
  url.searchParams.set("pageNo",     "1");
  url.searchParams.set("bizno",      bizNo);
  url.searchParams.set("inqryDiv",   "3");

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;

  const xml = await res.text();
  if (parseTotalCount(xml) === 0) return null;

  const items = parseXmlItems(xml);
  const item  = items[0];
  if (!item) return null;

  const adrs = [item["adrs"] ?? "", item["dtlAdrs"] ?? ""].filter(Boolean).join(" ").trim();

  return {
    bizName:       item["corpNm"]    ?? "",
    ceoName:       item["ceoNm"]     ?? "",
    address:       adrs,
    establishedAt: toYYYYMMDD(item["opbizDt"] ?? ""),
    employeeCount: parseInt(item["emplyeNum"] ?? "0", 10) || 0,
    capitalAmount: 0,  // API 미제공
  };
}

// ─── 조달업체 업종(면허) 조회 ────────────────────────────────────────────────
// getPrcrmntCorpIndstrytyInfo02: inqryDiv=1 + bizno

async function fetchLicenses(bizNo: string): Promise<G2BLicense[]> {
  const url = new URL(`${USR_BASE}/getPrcrmntCorpIndstrytyInfo02`);
  url.searchParams.set("serviceKey", apiKey());
  url.searchParams.set("numOfRows",  "100");
  url.searchParams.set("pageNo",     "1");
  url.searchParams.set("bizno",      bizNo);
  url.searchParams.set("inqryDiv",   "1");

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return [];

  const xml = await res.text();
  if (parseTotalCount(xml) === 0) return [];

  return parseXmlItems(xml)
    .filter(item => item["indstrytyNm"])
    .map(item => ({
      licenseType: item["indstrytyNm"]   ?? "",
      licenseNo:   item["indstrytyCd"]   ?? "",
      registAt:    toYYYYMMDD(item["rgstDt"] ?? ""),
      gradeNm:     item["indstrytyStatsNm"] ?? "",
      validYn:     validYn(item["vldPrdExprtDt"] ?? ""),
      isMain:      item["rprsntIndstrytyYn"] === "Y",
    }));
}

// ─── 퍼블릭 API ──────────────────────────────────────────────────────────────

export async function fetchG2BCompanyInfo(
  bizNo: string
): Promise<G2BCompanyInfo | null> {
  const [basic, licenses] = await Promise.all([
    fetchBasicInfo(bizNo),
    fetchLicenses(bizNo),
  ]);

  if (!basic && licenses.length === 0) return null;

  return {
    bizName:       basic?.bizName       ?? "",
    ceoName:       basic?.ceoName       ?? "",
    address:       basic?.address       ?? "",
    establishedAt: basic?.establishedAt ?? "",
    employeeCount: basic?.employeeCount ?? 0,
    capitalAmount: 0,
    licenses,
  };
}

// ─── 계약실적 조회 ───────────────────────────────────────────────────────────
// CntrctInfoService — 활성화 후 아래 구현 활성화

export async function fetchG2BContracts(
  bizNo: string,
  maxPages = 10
): Promise<G2BContract[]> {
  // 건설공사 + 용역 계약 모두 시도
  const ops = ["getCntrctInfoListCnstwk", "getCntrctInfoListServc"];
  const results: G2BContract[] = [];

  for (const op of ops) {
    let page = 1;
    while (page <= maxPages) {
      const url = new URL(`${CNTR_BASE}/${op}`);
      url.searchParams.set("serviceKey", apiKey());
      url.searchParams.set("numOfRows",  "100");
      url.searchParams.set("pageNo",     String(page));
      url.searchParams.set("bizno",      bizNo);

      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) break;  // 404 = 미활성 or 해당 업체 데이터 없음

      const xml = await res.text();
      const total = parseTotalCount(xml);
      if (total === 0) break;

      const items = parseXmlItems(xml);
      for (const item of items) {
        const completionDate = toYYYYMMDD(item["cmpltDt"] ?? item["complDt"] ?? "");
        results.push({
          projectName:    item["cntrctNm"]  ?? item["prjctNm"]  ?? "",
          client:         item["dminsttNm"] ?? item["orgnNm"]   ?? "",
          amount:         (item["cntrctAmt"] ?? "0").replace(/[^0-9]/g, ""),
          contractDate:   toYYYYMMDD(item["cntrctDt"]  ?? ""),
          completionDate,
          category:       item["indutyNm"]  ?? item["ctgryNm"]  ?? "",
          year:           parseInt(completionDate.slice(0, 4), 10) || new Date().getFullYear(),
        });
      }

      if (page * 100 >= total) break;
      page++;
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return results;
}
