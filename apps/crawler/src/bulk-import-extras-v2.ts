/**
 * bulk-import-extras v2 — 배치 UPDATE 최적화 (50~100배 가속)
 *
 * v1: 행당 UPDATE 1번 네트워크 왕복 (월당 15분)
 * v2: jsonb_to_recordset + 단일 UPDATE JOIN (월당 5~30초 목표)
 *
 * 실행: pnpm ts-node src/bulk-import-extras-v2.ts [--from YYYYMM] [--to YYYYMM]
 * idempotent: 재실행 안전 (ON CONFLICT, array_cat 병합)
 */
import { Pool, PoolClient } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadEnv(): { dbUrl: string; apiKey: string } {
  const rootEnv = path.resolve(__dirname, "../../../.env");
  const env: Record<string, string> = {};
  try {
    const c = fs.readFileSync(rootEnv, "utf-8");
    for (const l of c.split("\n")) {
      const t = l.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      env[k] = v;
    }
  } catch {}
  const dbUrl = env.DATABASE_URL || process.env.DATABASE_URL || "";
  const apiKey = env.KONEPS_API_KEY || env.G2B_API_KEY || process.env.KONEPS_API_KEY || "";
  if (!dbUrl || !apiKey) throw new Error("DATABASE_URL 또는 KONEPS_API_KEY 없음");
  return { dbUrl, apiKey };
}

const BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";
const BASE_HRCSP = "https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService";
const PAGE_SIZE = 999;

interface G2BResponse<T = unknown> {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: {
      items?: T[] | { item: T | T[] };
      numOfRows?: number;
      pageNo?: number;
      totalCount?: number;
    };
  };
}

function normalizeItems<T>(items: unknown): T[] {
  if (!items) return [];
  if (Array.isArray(items)) return items as T[];
  const obj = items as { item?: T | T[] };
  if (obj.item == null) return [];
  return Array.isArray(obj.item) ? obj.item : [obj.item];
}

async function fetchPage<T>(
  op: string,
  params: Record<string, string>,
  pageNo: number,
  apiKey: string,
  base: string = BASE,
): Promise<{ items: T[]; totalCount: number }> {
  const url = new URL(`${base}/${op}`);
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("inqryDiv", "1");
  url.searchParams.set("numOfRows", String(PAGE_SIZE));
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("type", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  for (let retry = 0; retry < 3; retry++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as G2BResponse<T>;
      const code = json.response?.header?.resultCode;
      if (code && code !== "00") throw new Error(`${code}: ${json.response?.header?.resultMsg}`);
      const items = normalizeItems<T>(json.response?.body?.items);
      const totalCount = json.response?.body?.totalCount ?? 0;
      return { items, totalCount };
    } catch (e) {
      if (retry === 2) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (retry + 1)));
    }
  }
  return { items: [], totalCount: 0 };
}

async function fetchAll<T>(
  op: string,
  params: Record<string, string>,
  apiKey: string,
  label: string,
  base: string = BASE,
): Promise<T[]> {
  const all: T[] = [];
  let pageNo = 1;
  while (true) {
    const { items, totalCount } = await fetchPage<T>(op, params, pageNo, apiKey, base);
    all.push(...items);
    if (pageNo === 1 && totalCount > 0) console.log(`    ${label}: ${totalCount}건`);
    if (items.length < PAGE_SIZE) break;
    pageNo++;
    if (pageNo > 1000) { console.error(`    [${op}] 1000페이지 초과 중단`); break; }
  }
  return all;
}

// ─── 배치 UPDATE: LicenseLimit → subCategories ─────────────────────────────
interface LicenseLimitItem {
  bidNtceNo: string;
  lcnsLmtNm?: string;
  indstrytyMfrcFldList?: string;
}
function parseIndstrytyList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const matches = raw.matchAll(/\[\d+\^([^\]]+)\]/g);
  const out = new Set<string>();
  for (const m of matches) out.add(m[1].trim());
  return Array.from(out);
}
function parseLcnsLmtNm(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const idx = raw.indexOf("/");
  return idx > 0 ? raw.slice(0, idx).trim() : raw.trim();
}
async function batchUpsertLicenseLimit(items: LicenseLimitItem[], client: PoolClient): Promise<number> {
  const byAnn = new Map<string, Set<string>>();
  for (const it of items) {
    if (!it.bidNtceNo) continue;
    const set = byAnn.get(it.bidNtceNo) ?? new Set<string>();
    parseIndstrytyList(it.indstrytyMfrcFldList).forEach((x) => set.add(x));
    const fromName = parseLcnsLmtNm(it.lcnsLmtNm);
    if (fromName) set.add(fromName);
    byAnn.set(it.bidNtceNo, set);
  }
  if (byAnn.size === 0) return 0;
  const payload = Array.from(byAnn).filter(([, s]) => s.size > 0).map(([ann_id, s]) => ({
    ann_id,
    cats: Array.from(s),
  }));
  if (payload.length === 0) return 0;

  const res = await client.query(
    `
    UPDATE "Announcement" a SET
      "subCategories" = (
        SELECT ARRAY_AGG(DISTINCT x) FROM UNNEST(a."subCategories" || v.cats) AS x
      )
    FROM jsonb_to_recordset($1::jsonb) AS v(ann_id text, cats text[])
    WHERE a."konepsId" = v.ann_id
    `,
    [JSON.stringify(payload)],
  );
  return res.rowCount ?? 0;
}

// ─── 배치 UPDATE: BsisAmount → bsisAmt, priceRange, priceRangeRate ──────────
interface BsisAmountItem {
  bidNtceNo: string;
  bssamt?: string;
  rsrvtnPrceRngBgnRate?: string;
  rsrvtnPrceRngEndRate?: string;
  // A값 관련 필드 (공사용 BsisAmount에만 존재)
  sftyMngcst?: string;
  sftyChckMngcst?: string;
  rtrfundNon?: string;
  mrfnHealthInsrprm?: string;
  npnInsrprm?: string;
  odsnLngtrmrcprInsrprm?: string;
  qltyMngcst?: string;
  qltyMngcstAObjYn?: string;
  bidPrceCalclAYn?: string;
}
async function batchUpsertBsisAmount(items: BsisAmountItem[], client: PoolClient): Promise<number> {
  if (items.length === 0) return 0;
  const toNum = (s: string | undefined) => parseInt((s ?? "0").replace(/[^0-9]/g, ""), 10) || 0;
  const payload = items.filter(it => it.bidNtceNo).map(it => {
    const bs = toNum(it.bssamt);
    const bg = parseFloat((it.rsrvtnPrceRngBgnRate ?? "0").replace(/[^\-0-9.]/g, "")) || 0;
    const ed = parseFloat((it.rsrvtnPrceRngEndRate ?? "0").replace(/[^\-0-9.]/g, "")) || 0;
    const details = {
      sftyMngcst: toNum(it.sftyMngcst),
      sftyChckMngcst: toNum(it.sftyChckMngcst),
      rtrfundNon: toNum(it.rtrfundNon),
      mrfnHealthInsrprm: toNum(it.mrfnHealthInsrprm),
      npnInsrprm: toNum(it.npnInsrprm),
      odsnLngtrmrcprInsrprm: toNum(it.odsnLngtrmrcprInsrprm),
      qltyMngcst: it.qltyMngcstAObjYn === "Y" ? toNum(it.qltyMngcst) : 0,
    };
    const aTotal = Object.values(details).reduce((s, v) => s + v, 0);
    const aYn = it.bidPrceCalclAYn ?? "";
    return {
      ann_id: it.bidNtceNo,
      bs,
      bg,
      ed,
      range_str: bg !== 0 || ed !== 0 ? `${bg}~${ed}` : "",
      a_total: aTotal,
      a_yn: aYn,
      a_details: details,
    };
  });
  if (payload.length === 0) return 0;

  const res = await client.query(
    `
    UPDATE "Announcement" a SET
      "bsisAmt"              = CASE WHEN v.bs > 0 THEN v.bs ELSE a."bsisAmt" END,
      "rsrvtnPrceRngBgnRate" = v.bg,
      "rsrvtnPrceRngEndRate" = v.ed,
      "priceRangeRate"       = CASE WHEN a."priceRangeRate" = '' THEN v.range_str ELSE a."priceRangeRate" END,
      "aValueTotal"          = CASE WHEN v.a_total > 0 THEN v.a_total::bigint ELSE a."aValueTotal" END,
      "aValueYn"             = CASE WHEN v.a_yn != '' THEN v.a_yn ELSE a."aValueYn" END,
      "aValueDetails"        = CASE WHEN v.a_total > 0 THEN v.a_details ELSE a."aValueDetails" END
    FROM jsonb_to_recordset($1::jsonb) AS v(ann_id text, bs bigint, bg float8, ed float8, range_str text, a_total bigint, a_yn text, a_details jsonb)
    WHERE a."konepsId" = v.ann_id
    `,
    [JSON.stringify(payload)],
  );
  return res.rowCount ?? 0;
}

// ─── 배치 UPDATE: CalclA → aValueTotal + aValueDetails ──────────────────────
interface CalclAItem {
  bidNtceNo: string;
  sftyMngcst?: string;
  sftyChckMngcst?: string;
  rtrfundNon?: string;
  mrfnHealthInsrprm?: string;
  npnInsrprm?: string;
  odsnLngtrmrcprInsrprm?: string;
  qltyMngcst?: string;
}
async function batchUpsertCalclA(items: CalclAItem[], client: PoolClient): Promise<number> {
  if (items.length === 0) return 0;
  const toNum = (s: string | undefined) => parseInt((s ?? "0").replace(/[^0-9]/g, ""), 10) || 0;
  const payload = items.filter(it => it.bidNtceNo).map(it => {
    const details = {
      sftyMngcst: toNum(it.sftyMngcst),
      sftyChckMngcst: toNum(it.sftyChckMngcst),
      rtrfundNon: toNum(it.rtrfundNon),
      mrfnHealthInsrprm: toNum(it.mrfnHealthInsrprm),
      npnInsrprm: toNum(it.npnInsrprm),
      odsnLngtrmrcprInsrprm: toNum(it.odsnLngtrmrcprInsrprm),
      qltyMngcst: toNum(it.qltyMngcst),
    };
    const total = Object.values(details).reduce((s, v) => s + v, 0);
    return { ann_id: it.bidNtceNo, total, details };
  }).filter(x => x.total > 0);
  if (payload.length === 0) return 0;

  const res = await client.query(
    `
    UPDATE "Announcement" a SET
      "aValueTotal"   = v.total,
      "aValueDetails" = v.details,
      "aValueYn"      = CASE WHEN a."aValueYn" = '' THEN 'Y' ELSE a."aValueYn" END
    FROM jsonb_to_recordset($1::jsonb) AS v(ann_id text, total bigint, details jsonb)
    WHERE a."konepsId" = v.ann_id
    `,
    [JSON.stringify(payload)],
  );
  return res.rowCount ?? 0;
}

// ─── 배치 INSERT: ChgHstry → AnnouncementChgHst ─────────────────────────────
interface ChgHstItem {
  bidNtceNo: string;
  chgNtceSeq?: string;
  chgNtceRsnNm?: string;
  chgNtceDt?: string;
  [k: string]: unknown;
}
async function batchInsertChgHst(items: ChgHstItem[], client: PoolClient): Promise<number> {
  if (items.length === 0) return 0;
  // (ann_id, seq) 중복 제거 (ON CONFLICT 중복 업데이트 방지)
  const seen = new Set<string>();
  const unique = items.filter(it => {
    if (!it.bidNtceNo) return false;
    const seq = parseInt(it.chgNtceSeq ?? "0", 10) || 0;
    const key = `${it.bidNtceNo}:${seq}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // 해당 annId가 Announcement에 존재해야 FK 제약 OK → EXISTS 서브쿼리로 필터
  const payload = unique.map(it => ({
    ann_id: it.bidNtceNo,
    seq: parseInt(it.chgNtceSeq ?? "0", 10) || 0,
    reason: it.chgNtceRsnNm ?? "",
    chg_date: it.chgNtceDt ? new Date(it.chgNtceDt.replace(" ", "T") + "+09:00").toISOString() : null,
    raw: it,
  }));
  if (payload.length === 0) return 0;

  const res = await client.query(
    `
    INSERT INTO "AnnouncementChgHst" (id, "annId", "chgNtceSeq", "chgRsnNm", "chgDate", "rawJson")
    SELECT gen_random_uuid()::text, v.ann_id, v.seq, v.reason, v.chg_date, v.raw
    FROM jsonb_to_recordset($1::jsonb) AS v(ann_id text, seq int, reason text, chg_date timestamptz, raw jsonb)
    WHERE EXISTS (SELECT 1 FROM "Announcement" a WHERE a."konepsId" = v.ann_id)
    ON CONFLICT ("annId", "chgNtceSeq") DO UPDATE SET
      "chgRsnNm" = EXCLUDED."chgRsnNm",
      "chgDate"  = EXCLUDED."chgDate",
      "rawJson"  = EXCLUDED."rawJson"
    `,
    [JSON.stringify(payload)],
  );
  return res.rowCount ?? 0;
}

// ─── Frgcpt: 외자 공고 → Announcement upsert ────────────────────────────────
interface FrgcptItem {
  bidNtceNo: string;
  bidNtceNm?: string;
  ntceInsttNm?: string;
  dminsttNm?: string;
  bidNtceDt?: string;
  bidClseDt?: string;
  presmptPrce?: string;
  bssamt?: string;
  sucsfbidLwltRate?: string;
  [k: string]: unknown;
}
async function batchUpsertFrgcpt(items: FrgcptItem[], client: PoolClient): Promise<number> {
  if (items.length === 0) return 0;
  // bidNtceNo 중복 제거 (ON CONFLICT 중복 업데이트 방지)
  const seen = new Set<string>();
  const unique = items.filter(it => {
    if (!it.bidNtceNo || seen.has(it.bidNtceNo)) return false;
    seen.add(it.bidNtceNo);
    return true;
  });
  const payload = unique.map(it => ({
    ann_id: it.bidNtceNo,
    title: it.bidNtceNm ?? "",
    org: it.ntceInsttNm ?? it.dminsttNm ?? "",
    deadline: it.bidClseDt ? new Date(it.bidClseDt.replace(" ", "T") + "+09:00").toISOString() : new Date("2099-12-31T23:59:59+09:00").toISOString(),
    budget: parseInt((it.presmptPrce ?? "0").replace(/[^0-9]/g, ""), 10) || 0,
    bsis: parseInt((it.bssamt ?? "0").replace(/[^0-9]/g, ""), 10) || 0,
    lwlt: parseFloat(String(it.sucsfbidLwltRate ?? "").replace(/[^0-9.]/g, "")) || 0,
    raw: it,
  }));
  if (payload.length === 0) return 0;

  const res = await client.query(
    `
    INSERT INTO "Announcement" (id, "konepsId", title, "orgName", category, region, deadline, budget, "bsisAmt", "sucsfbidLwltRate", "rawJson", "createdAt")
    SELECT gen_random_uuid()::text, v.ann_id, v.title, v.org, '외자', '전국', v.deadline, v.budget, v.bsis, v.lwlt, v.raw, NOW()
    FROM jsonb_to_recordset($1::jsonb) AS v(ann_id text, title text, org text, deadline timestamptz, budget bigint, bsis bigint, lwlt float8, raw jsonb)
    ON CONFLICT ("konepsId") DO UPDATE SET
      budget              = CASE WHEN EXCLUDED.budget > 0 THEN EXCLUDED.budget ELSE "Announcement".budget END,
      "bsisAmt"           = CASE WHEN EXCLUDED."bsisAmt" > 0 THEN EXCLUDED."bsisAmt" ELSE "Announcement"."bsisAmt" END,
      "sucsfbidLwltRate"  = CASE WHEN EXCLUDED."sucsfbidLwltRate" > 0 THEN EXCLUDED."sucsfbidLwltRate" ELSE "Announcement"."sucsfbidLwltRate" END,
      "rawJson"           = "Announcement"."rawJson" || EXCLUDED."rawJson"
    `,
    [JSON.stringify(payload)],
  );
  return res.rowCount ?? 0;
}

// ─── 배치 INSERT: PreStdrd (사전규격) ────────────────────────────────────────
interface PreStdrdItem {
  bfSpecRgstNo: string;
  bfSpecRgstNm?: string;
  rcptDt?: string;
  ntceInsttNm?: string;
  [k: string]: unknown;
}
async function ensurePreStdrdTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "PreStdrd" (
      "id"           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "bfSpecRgstNo" text UNIQUE NOT NULL,
      "bfSpecRgstNm" text,
      "rcptDt"       timestamptz,
      "ntceInsttNm"  text,
      "rawJson"      jsonb NOT NULL,
      "createdAt"    timestamptz NOT NULL DEFAULT NOW(),
      "updatedAt"    timestamptz NOT NULL DEFAULT NOW()
    )
  `);
}
async function batchInsertPreStdrd(items: PreStdrdItem[], client: PoolClient): Promise<number> {
  if (items.length === 0) return 0;
  const seen = new Set<string>();
  const unique = items.filter(it => {
    if (!it.bfSpecRgstNo || seen.has(it.bfSpecRgstNo)) return false;
    seen.add(it.bfSpecRgstNo);
    return true;
  });
  const payload = unique.map(it => ({
    reg_no: it.bfSpecRgstNo,
    reg_nm: it.bfSpecRgstNm ?? "",
    rcpt_dt: it.rcptDt ? new Date(it.rcptDt.replace(" ", "T") + "+09:00").toISOString() : null,
    inst_nm: it.ntceInsttNm ?? "",
    raw: it,
  }));
  if (payload.length === 0) return 0;

  const res = await client.query(
    `
    INSERT INTO "PreStdrd" ("bfSpecRgstNo", "bfSpecRgstNm", "rcptDt", "ntceInsttNm", "rawJson")
    SELECT v.reg_no, v.reg_nm, v.rcpt_dt, v.inst_nm, v.raw
    FROM jsonb_to_recordset($1::jsonb) AS v(reg_no text, reg_nm text, rcpt_dt timestamptz, inst_nm text, raw jsonb)
    ON CONFLICT ("bfSpecRgstNo") DO UPDATE SET
      "bfSpecRgstNm" = EXCLUDED."bfSpecRgstNm",
      "rcptDt"       = EXCLUDED."rcptDt",
      "ntceInsttNm"  = EXCLUDED."ntceInsttNm",
      "rawJson"      = EXCLUDED."rawJson",
      "updatedAt"    = NOW()
    `,
    [JSON.stringify(payload)],
  );
  return res.rowCount ?? 0;
}

// ─── main ────────────────────────────────────────────────────────────────────
function parseYYYYMM(arg: string): [number, number] {
  return [parseInt(arg.slice(0, 4), 10), parseInt(arg.slice(4, 6), 10)];
}
function fmtDt(y: number, m: number, day: number, hh: string): string {
  return `${y}${String(m).padStart(2, "0")}${String(day).padStart(2, "0")}${hh}`;
}
function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

async function main() {
  const args = process.argv.slice(2);
  const fromArg = args.find((a) => a.startsWith("--from="))?.slice(7)
               ?? (args.includes("--from") ? args[args.indexOf("--from") + 1] : "200201");
  const toArg = args.find((a) => a.startsWith("--to="))?.slice(5)
             ?? (args.includes("--to") ? args[args.indexOf("--to") + 1] : undefined);
  const [fromY, fromM] = parseYYYYMM(fromArg);
  const now = new Date();
  const [toY, toM] = toArg ? parseYYYYMM(toArg) : [now.getFullYear(), now.getMonth() + 1];

  const { dbUrl, apiKey } = loadEnv();
  const pool = new Pool({ connectionString: dbUrl, max: 3, statement_timeout: 0 });

  // PreStdrd 테이블 보장
  const init = await pool.connect();
  try { await ensurePreStdrdTable(init); } finally { init.release(); }

  const months: [number, number][] = [];
  let y = fromY, m = fromM;
  while (y < toY || (y === toY && m <= toM)) {
    months.push([y, m]);
    m++; if (m > 12) { m = 1; y++; }
  }
  console.log(`=== Bulk Extras v2 (배치 UPDATE): ${fromArg} ~ ${toY}${String(toM).padStart(2, "0")} (${months.length}개월) ===\n`);

  const tStart = Date.now();
  for (let i = 0; i < months.length; i++) {
    const [yy, mm] = months[i];
    const last = daysInMonth(yy, mm);
    const bgn = fmtDt(yy, mm, 1, "0000");
    const end = fmtDt(yy, mm, last, "2359");
    const mT0 = Date.now();

    const client = await pool.connect();
    try {
      const lic = await fetchAll<LicenseLimitItem>("getBidPblancListInfoLicenseLimit", { inqryBgnDt: bgn, inqryEndDt: end }, apiKey, "LicenseLimit");
      const cns = await fetchAll<BsisAmountItem>("getBidPblancListInfoCnstwkBsisAmount", { inqryBgnDt: bgn, inqryEndDt: end }, apiKey, "CnstwkBsisAmount");
      const svc = await fetchAll<BsisAmountItem>("getBidPblancListInfoServcBsisAmount", { inqryBgnDt: bgn, inqryEndDt: end }, apiKey, "ServcBsisAmount");
      const thn = await fetchAll<BsisAmountItem>("getBidPblancListInfoThngBsisAmount", { inqryBgnDt: bgn, inqryEndDt: end }, apiKey, "ThngBsisAmount");
      const cal = await fetchAll<CalclAItem>("getBidPblancListBidPrceCalclAInfo", { inqryBgnDt: bgn, inqryEndDt: end }, apiKey, "CalclA");
      const chgC = await fetchAll<ChgHstItem>("getBidPblancListInfoChgHstryCnstwk", { inqryBgnDt: bgn, inqryEndDt: end }, apiKey, "ChgHstryCnstwk");
      const chgS = await fetchAll<ChgHstItem>("getBidPblancListInfoChgHstryServc", { inqryBgnDt: bgn, inqryEndDt: end }, apiKey, "ChgHstryServc");
      const chgT = await fetchAll<ChgHstItem>("getBidPblancListInfoChgHstryThng", { inqryBgnDt: bgn, inqryEndDt: end }, apiKey, "ChgHstryThng");
      const frg = await fetchAll<FrgcptItem>("getBidPblancListInfoFrgcpt", { inqryBgnDt: bgn, inqryEndDt: end }, apiKey, "Frgcpt");

      // PreStdrd 4종 (HrcspSsstndrdInfoService)
      const preAll: PreStdrdItem[] = [];
      for (const preOp of ["getPublicPrcureThngInfoCnstwk", "getPublicPrcureThngInfoServc", "getPublicPrcureThngInfoThng", "getPublicPrcureThngInfoFrgcpt"]) {
        try {
          const items = await fetchAll<PreStdrdItem>(preOp, { inqryBgnDt: bgn, inqryEndDt: end }, apiKey, preOp.replace("getPublicPrcureThngInfo", "PreStdrd"), BASE_HRCSP);
          preAll.push(...items);
        } catch (e) {}
      }

      // Frgcpt 먼저 upsert (Announcement 선생성 → ChgHst FK 안전)
      // 스키마 누락 필드로 실패 가능 → try-catch로 나머지 API 계속 진행
      let frgUpserted = 0;
      if (frg.length > 0) {
        try {
          frgUpserted = await batchUpsertFrgcpt(frg, client);
        } catch (e) {
          console.error(`    [Frgcpt] 실패 (skip): ${(e as Error).message.slice(0, 100)}`);
        }
      }

      // 같은 client는 동시 실행 불가 → 순차 배치 (각각 단일 쿼리라 빠름)
      const rLic = await batchUpsertLicenseLimit(lic, client);
      const rCns = await batchUpsertBsisAmount(cns, client);
      const rSvc = await batchUpsertBsisAmount(svc, client);
      const rThn = await batchUpsertBsisAmount(thn, client);
      const rCal = await batchUpsertCalclA(cal, client);
      const rC = await batchInsertChgHst(chgC, client);
      const rS = await batchInsertChgHst(chgS, client);
      const rT = await batchInsertChgHst(chgT, client);
      const rPre = await batchInsertPreStdrd(preAll, client);

      const mElapsed = ((Date.now() - mT0) / 1000).toFixed(1);
      const totalMin = ((Date.now() - tStart) / 1000 / 60).toFixed(1);
      const pct = ((i + 1) / months.length * 100).toFixed(1);
      console.log(`[${i + 1}/${months.length}] ${yy}-${String(mm).padStart(2, "0")} (${mElapsed}초) | Lic:${rLic} Cns:${rCns} Svc:${rSvc} Thn:${rThn} Cal:${rCal} ChgC:${rC} ChgS:${rS} ChgT:${rT} Frg:${frgUpserted} Pre:${rPre} | 전체 ${totalMin}분 (${pct}%)`);
    } catch (e) {
      console.error(`  ✗ ${yy}-${mm}: ${(e as Error).message}`);
    } finally {
      client.release();
    }
  }

  const totalMin = ((Date.now() - tStart) / 1000 / 60).toFixed(1);
  console.log(`\n=== v2 완료: ${totalMin}분 ===`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
