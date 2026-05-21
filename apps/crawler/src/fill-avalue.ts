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
  // 박상빈님 메모리 reference_g2b_apis.md A값 6필드 (공사 BsisAmount 응답에 모두 포함)
  sftyMngcst?: string;              // 안전관리비
  sftyChckMngcst?: string;          // 안전점검관리비
  rtrfundNon?: string;              // 퇴직공제부금
  mrfnHealthInsrprm?: string;       // 건강보험료
  npnInsrprm?: string;              // 국민연금료
  odsnLngtrmrcprInsrprm?: string;   // 장기요양보험료
  qltyMngcst?: string;              // 품질관리비
  qltyMngcstAObjYn?: string;        // 품질관리비 A값 포함 Y/N
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

async function fetchBsisAmount(bidNtceNo: string, apiKey: string): Promise<{
  aValueYn: string;
  aValueAmt: bigint;
  priceRangeRate: string;
  aValueTotal: bigint;       // 박상빈님 메모리 reference_g2b_apis — BsisAmount A값 6필드 합산
  aValueDetails: Record<string, number>;
} | null> {
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

  // 박상빈님 메모리 reference_g2b_apis.md 공식:
  //   sum = sftyMngcst + sftyChckMngcst + rtrfundNon
  //       + mrfnHealthInsrprm + npnInsrprm + odsnLngtrmrcprInsrprm
  //       + (qltyMngcstAObjYn === 'Y' ? qltyMngcst : 0)
  const toNum = (s: string | undefined) => Number((s ?? "0").replace(/[^0-9]/g, "")) || 0;
  const details = {
    sftyMngcst:             toNum(item.sftyMngcst),
    sftyChckMngcst:         toNum(item.sftyChckMngcst),
    rtrfundNon:             toNum(item.rtrfundNon),
    mrfnHealthInsrprm:      toNum(item.mrfnHealthInsrprm),
    npnInsrprm:             toNum(item.npnInsrprm),
    odsnLngtrmrcprInsrprm:  toNum(item.odsnLngtrmrcprInsrprm),
    qltyMngcst:             item.qltyMngcstAObjYn === "Y" ? toNum(item.qltyMngcst) : 0,
  };
  const aValueTotal = BigInt(Object.values(details).reduce((s, v) => s + v, 0));

  return { aValueYn, aValueAmt, priceRangeRate, aValueTotal, aValueDetails: details };
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

  // 박상빈님 5/20 명시 D-2 진단 — category NOT IN ('물품','용역','기타') 광범위 = 학술연구서비스/설계/외자 등 비공사 포함
  // → CnstwkBsisAmount op 0% 응답 = 매칭률 0.26%
  // 박상빈님 메모리 reference_g2b_apis: "공사 BsisAmount 에만 A값 필드 존재"
  // → MAIN_CNSTWK_MAP value 19개 + "시설공사" 기본값으로 IN 필터링 (공사만)
  const CNSTWK_CATEGORIES = [
    "시설공사", "건축공사", "토건공사", "토목공사", "조경공사", "산업환경공사",
    "전기공사", "통신공사", "소방시설공사", "지반조성포장공사", "실내건축공사",
    "철근콘크리트공사", "구조물해체비계공사", "상하수도설비공사", "도장습식방수석공사",
    "조경식재공사", "조경시설물공사", "철강재설치공사", "기계설비공사",
  ];

  // 진행중 공사 카테고리만 (MAIN_CNSTWK_MAP value + 기본값)
  let all: { id: string; konepsId: string; aValueYn: string; aValueTotal: string; priceRangeRate: string; ym: string }[] = [];
  try {
    const r = await pool.query(
      `SELECT id, "konepsId", "aValueYn", "aValueTotal"::text AS "aValueTotal", "priceRangeRate",
              TO_CHAR("deadline", 'YYYYMM') AS ym
       FROM "Announcement"
       WHERE "category" = ANY($2::text[])
         AND "deadline" >= $1::timestamptz`,
      [now, CNSTWK_CATEGORIES],
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

  // 박상빈님 5/20 명시 — bulk fetch (inqryDiv=1) ym 매칭 실패 95% (마감일 ym 와 G2B 응답 시점 불일치)
  // → inqryDiv=2 단건 조회로 변경 (5/5 검증 완료). 박상빈님 메모리 `recollect_acceleration` 2 worker 적용.
  let updated = 0;
  let skipped = 0;
  let processed = 0;
  const tStart = Date.now();

  async function processOne(ann: typeof list[number]): Promise<void> {
    try {
      const bs = await fetchBsisAmount(ann.konepsId, apiKey);
      if (!bs) { skipped++; return; }
      // 박상빈님 메모리 reference_g2b_apis — BsisAmount A값 6필드 우선. 0 일 때만 CalclA op 폴백.
      let aValueTotal = bs.aValueTotal;
      if (bs.aValueYn === "Y" && aValueTotal === 0n) {
        aValueTotal = await fetchATotal(ann.konepsId, apiKey);
      }
      await pool.query(
        `UPDATE "Announcement" SET
           "aValueYn"        = $2,
           "aValueAmt"       = CASE WHEN $3::bigint > 0 THEN $3::bigint ELSE "aValueAmt" END,
           "aValueTotal"     = CASE WHEN $4::bigint > 0 THEN $4::bigint ELSE "aValueTotal" END,
           "priceRangeRate"  = CASE WHEN $5 != '' THEN $5 ELSE "priceRangeRate" END,
           "aValueDetails"   = CASE WHEN $4::bigint > 0 THEN $6::jsonb ELSE "aValueDetails" END
         WHERE id = $1`,
        [ann.id, bs.aValueYn, bs.aValueAmt.toString(), aValueTotal.toString(), bs.priceRangeRate, JSON.stringify(bs.aValueDetails)],
      );
      updated++;
    } catch (e) {
      console.error(`[${ann.konepsId}] 오류:`, (e as Error).message);
    } finally {
      processed++;
      if (processed % 200 === 0) {
        const rate = processed / ((Date.now() - tStart) / 1000);
        const eta = Math.round((list.length - processed) / rate);
        console.log(`  ${processed}/${list.length} (${rate.toFixed(1)} row/s, ETA ${eta}s) | 업데이트 ${updated} | 스킵 ${skipped}`);
      }
    }
  }

  // 박상빈님 메모리 recollect_acceleration: 2 worker
  const WORKER = 2;
  const queue = [...list];
  async function worker() {
    while (queue.length > 0) {
      const ann = queue.shift();
      if (!ann) break;
      await processOne(ann);
    }
  }
  await Promise.all(Array.from({ length: WORKER }, () => worker()));

  console.log(`\n완료: ${updated}건 업데이트 / ${skipped}건 스킵(G2B 응답 없음) / 총 ${list.length}건 (${((Date.now() - tStart) / 1000 / 60).toFixed(1)}분)`);
  await pool.end();
}

// 직접 실행 시에만 진입
if (require.main === module) {
  fillAValue().catch(console.error);
}
