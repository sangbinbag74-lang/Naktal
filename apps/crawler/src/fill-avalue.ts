import { Pool } from "pg";
import * as fs from "fs";
import * as https from "https";
import * as path from "path";

// .env 로드 (파일 없으면 process.env 폴백)
function loadEnv(): { url: string; key: string; apiKey: string; dbUrl: string } {
  let text = "";
  // tsx에서 __dirname이 "."로 나오는 이슈 → 여러 경로 순서대로 시도
  const candidates = [
    path.resolve(__dirname, "../../../.env"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(process.cwd(), ".env"),
  ];
  try {
    for (const p of candidates) {
      if (fs.existsSync(p)) { text = fs.readFileSync(p, "utf8"); break; }
    }
  } catch {
    // GitHub Actions 등 파일 없는 환경 → process.env에서 직접 읽음
  }

  const get = (k: string) => {
    if (text) {
      for (const line of text.split("\n")) {
        if (line.startsWith(k + "=")) return line.slice(k.length + 1).replace(/^["']|["']\s*$/g, "").trim();
      }
    }
    return process.env[k] ?? "";
  };
  return {
    url: get("NEXT_PUBLIC_SUPABASE_URL"),
    key: get("SUPABASE_SERVICE_ROLE_KEY"),
    apiKey: get("KONEPS_API_KEY") || get("G2B_API_KEY"),
    dbUrl: get("DATABASE_URL"),
  };
}

const BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";

interface BsisAmountItem {
  bssamt?: string;
  bidPrceCalclAYn?: string;
  rsrvtnPrceRngBgnRate?: string;  // 예비가격 범위 시작 (예: "-2")
  rsrvtnPrceRngEndRate?: string;  // 예비가격 범위 끝 (예: "+2")
}

interface AInfoItem {
  npnInsrprm?: string;
  mrfnHealthInsrprm?: string;
  rtrfundNon?: string;
  odsnLngtrmrcprInsrprm?: string;
  sftyMngcst?: string;
  qltyMngcst?: string;
  qltyMngcstAObjYn?: string;
}

/**
 * 기초금액 API → bssamt(기초금액), bidPrceCalclAYn(A값여부) 조회
 */
// Node.js 내장 fetch가 Windows에서 hang → https 모듈 직접 사용
function httpsGet(url: string, ms = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { req.destroy(); reject(new Error("timeout")); }, ms);
    const req = https.get(url, (res) => {
      let body = "";
      res.on("data", (d: Buffer) => { body += d.toString(); });
      res.on("end", () => { clearTimeout(timer); resolve(body); });
      res.on("error", (e: Error) => { clearTimeout(timer); reject(e); });
    });
    req.on("error", (e: Error) => { clearTimeout(timer); reject(e); });
  });
}

function safeJson<T>(text: string): T | null {
  try { return JSON.parse(text) as T; } catch { return null; }
}

async function fetchBsisAmount(bidNtceNo: string, apiKey: string): Promise<{ aValueYn: string; aValueAmt: bigint; priceRangeRate: string } | null> {
  const url = `${BASE}/getBidPblancListInfoCnstwkBsisAmount?serviceKey=${apiKey}&inqryDiv=2&bidNtceNo=${bidNtceNo}&bidNtceOrd=000&numOfRows=1&pageNo=1&type=json`;
  const text = await httpsGet(url);
  const json = safeJson<{ response?: { body?: { items?: BsisAmountItem[] } } }>(text);
  const items = json?.response?.body?.items ?? [];
  if (!Array.isArray(items) || items.length === 0) return null;

  const item = items[0];
  const aValueYn = item.bidPrceCalclAYn ?? "";
  const aValueAmt = BigInt(item.bssamt ? Math.round(Number(item.bssamt)) : 0);
  const bgn = item.rsrvtnPrceRngBgnRate ?? "";
  const end = item.rsrvtnPrceRngEndRate ?? "";
  const priceRangeRate = bgn && end ? `${bgn}~${end}` : "";
  return { aValueYn, aValueAmt, priceRangeRate };
}

/**
 * A값 정보 API → A합산(국민연금 + 건강보험 + 퇴직공제부금 + 산재보험 + 안전관리비 + 품질관리비) 조회
 */
async function fetchATotal(bidNtceNo: string, apiKey: string): Promise<bigint> {
  const url = `${BASE}/getBidPblancListBidPrceCalclAInfo?serviceKey=${apiKey}&inqryDiv=2&bidNtceNo=${bidNtceNo}&bidNtceOrd=000&numOfRows=1&pageNo=1&type=json`;
  const text = await httpsGet(url);
  const json = safeJson<{ response?: { body?: { items?: AInfoItem[] } } }>(text);
  const items = json?.response?.body?.items ?? [];
  if (!Array.isArray(items) || items.length === 0) return 0n;

  const item = items[0];
  const sum =
    Number(item.npnInsrprm ?? 0) +
    Number(item.mrfnHealthInsrprm ?? 0) +
    Number(item.rtrfundNon ?? 0) +
    Number(item.odsnLngtrmrcprInsrprm ?? 0) +
    Number(item.sftyMngcst ?? 0) +
    (item.qltyMngcstAObjYn === "Y" ? Number(item.qltyMngcst ?? 0) : 0);
  return BigInt(Math.round(sum));
}

/** Bulk 모드 fetch: BsisAmount 또는 CalclA 의 inqryDiv=1 (월별) 호출 — 모든 공고 응답 */
async function fetchBulk(operation: string, ym: string, apiKey: string): Promise<Record<string, BsisAmountItem | AInfoItem>> {
  const map: Record<string, BsisAmountItem | AInfoItem> = {};
  const yyyy = ym.slice(0, 4);
  const mm = ym.slice(4, 6);
  const lastDay = new Date(parseInt(yyyy), parseInt(mm), 0).getDate();
  const bgn = `${yyyy}${mm}010000`;
  const end = `${yyyy}${mm}${String(lastDay).padStart(2, "0")}2359`;

  let pageNo = 1;
  while (pageNo <= 100) {
    const url = `${BASE}/${operation}?serviceKey=${apiKey}&inqryDiv=1&inqryBgnDt=${bgn}&inqryEndDt=${end}&numOfRows=999&pageNo=${pageNo}&type=json`;
    let text = "";
    try { text = await httpsGet(url, 30000); } catch (e) { break; }
    const json = safeJson<{ response?: { body?: { items?: any[]; totalCount?: number } } }>(text);
    const items = json?.response?.body?.items;
    if (!items || !Array.isArray(items) || items.length === 0) break;
    for (const it of items) {
      const key = (it.bidNtceNo ?? "") + "_" + (it.bidNtceOrd ?? "000");
      map[key] = it;
      if (it.bidNtceNo) map[it.bidNtceNo] = it; // ord 무시 매칭용
    }
    if (items.length < 999) break;
    pageNo++;
  }
  return map;
}

export async function fillAValue() {
  const { apiKey, dbUrl } = loadEnv();
  if (!dbUrl) { console.error("DATABASE_URL 미설정 — fill-avalue 중단"); return; }
  const pool = new Pool({ connectionString: dbUrl, max: 2, statement_timeout: 0 });
  const now = new Date().toISOString();

  // 진행중 시설공사 (deadline 정보 포함, ym 그룹핑용)
  let all: { id: string; konepsId: string; aValueYn: string; aValueTotal: string; priceRangeRate: string; ym: string }[] = [];
  try {
    const r = await pool.query(
      `SELECT id, "konepsId", "aValueYn", "aValueTotal"::text AS "aValueTotal", "priceRangeRate",
              TO_CHAR("deadline", 'YYYYMM') AS ym
       FROM "Announcement"
       WHERE "category" NOT IN ('물품','용역','기타')
         AND "deadline" >= $1::timestamptz`,
      [now],
    );
    all = r.rows;
  } catch (e) {
    console.error("조회 실패:", (e as Error).message);
    await pool.end();
    return;
  }

  const list = all.filter(a =>
    !a.aValueYn ||
    !a.priceRangeRate ||
    (a.aValueYn === "Y" && (!a.aValueTotal || a.aValueTotal === "0"))
  );
  console.log(`진행중 공사 공고: ${all.length}건 | 처리 대상: ${list.length}건`);

  // ym 그룹 (마감 기준 + 주변 월 포함, 공고일 vs 마감일 차이 보정)
  const ymSet = new Set<string>();
  for (const ann of list) {
    if (!ann.ym) continue;
    ymSet.add(ann.ym);
    // 마감 ym 이전 1~2 개월 포함 (공고가 보통 한두 달 전 등록)
    const y = parseInt(ann.ym.slice(0, 4));
    const m = parseInt(ann.ym.slice(4, 6));
    for (let off = 1; off <= 3; off++) {
      const d = new Date(y, m - 1 - off, 1);
      ymSet.add(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
  }
  const yms = Array.from(ymSet).sort();
  console.log(`Bulk fetch ym 수: ${yms.length}개`);

  // ym 별로 BsisAmount + CalclA bulk fetch
  const bsisMap: Record<string, BsisAmountItem> = {};
  const calclMap: Record<string, AInfoItem> = {};
  for (let i = 0; i < yms.length; i++) {
    const ym = yms[i];
    const t0 = Date.now();
    const bsis = await fetchBulk("getBidPblancListInfoCnstwkBsisAmount", ym, apiKey);
    const calcl = await fetchBulk("getBidPblancListBidPrceCalclAInfo", ym, apiKey);
    Object.assign(bsisMap, bsis);
    Object.assign(calclMap, calcl);
    console.log(`[${i + 1}/${yms.length}] ${ym} bulk fetch (${((Date.now() - t0) / 1000).toFixed(1)}s) | bsis ${Object.keys(bsis).length} / calcl ${Object.keys(calcl).length}`);
  }

  // 각 ann 에 대해 map lookup → bulk UPDATE
  let updated = 0;
  let skipped = 0;
  for (const ann of list) {
    const bs = bsisMap[ann.konepsId] as BsisAmountItem | undefined;
    if (!bs) { skipped++; continue; }
    const aValueYn = bs.bidPrceCalclAYn ?? "";
    const aValueAmt = BigInt(parseInt((bs.bssamt ?? "0").replace(/[^0-9]/g, ""), 10) || 0);
    const bgn = parseFloat((bs.rsrvtnPrceRngBgnRate ?? "0").replace(/[^\-0-9.]/g, "")) || 0;
    const end = parseFloat((bs.rsrvtnPrceRngEndRate ?? "0").replace(/[^\-0-9.]/g, "")) || 0;
    const priceRangeRate = bgn !== 0 || end !== 0 ? `${bgn}~${end}` : "";

    let aValueTotal = 0n;
    if (aValueYn === "Y") {
      const ai = calclMap[ann.konepsId] as AInfoItem | undefined;
      if (ai) {
        const sum =
          Number(ai.npnInsrprm ?? 0) +
          Number(ai.mrfnHealthInsrprm ?? 0) +
          Number(ai.rtrfundNon ?? 0) +
          Number(ai.odsnLngtrmrcprInsrprm ?? 0) +
          Number(ai.sftyMngcst ?? 0) +
          (ai.qltyMngcstAObjYn === "Y" ? Number(ai.qltyMngcst ?? 0) : 0);
        aValueTotal = BigInt(Math.round(sum));
      }
    }

    try {
      await pool.query(
        `UPDATE "Announcement" SET
           "aValueYn"        = $2,
           "aValueAmt"       = CASE WHEN $3::bigint > 0 THEN $3::bigint ELSE "aValueAmt" END,
           "aValueTotal"     = CASE WHEN $4::bigint > 0 THEN $4::bigint ELSE "aValueTotal" END,
           "priceRangeRate"  = CASE WHEN $5 != '' THEN $5 ELSE "priceRangeRate" END
         WHERE id = $1`,
        [ann.id, aValueYn, aValueAmt.toString(), aValueTotal.toString(), priceRangeRate],
      );
      updated++;
    } catch (e) {
      console.error(`[${ann.konepsId}] UPDATE 오류:`, (e as Error).message);
    }
  }

  console.log(`\n완료: ${updated}건 업데이트 / ${skipped}건 스킵(bulk 응답 없음) / 총 ${list.length}건`);
  await pool.end();
}

// 직접 실행 시에만 진입
if (require.main === module) {
  fillAValue().catch(console.error);
}
