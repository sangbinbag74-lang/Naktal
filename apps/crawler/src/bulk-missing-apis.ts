/**
 * Phase D: 누락 API 수집
 *
 * 1. getBidPblancListInfoChgHstryServc  → AnnouncementChgHst (용역 변경공고)
 * 2. getBidPblancListInfoChgHstryThng   → AnnouncementChgHst (물품 변경공고)
 * 3. getBidPblancListInfoFrgcpt         → Announcement upsert (외자 공고)
 * 4. getBidPblancListInfoPreStdrd       → PreStdrd (사전규격, 신규 테이블)
 *
 * 실행: pnpm ts-node src/bulk-missing-apis.ts [--from YYYYMM] [--to YYYYMM]
 */
import { Pool } from "pg";
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

// ChgHst upsert (Servc/Thng 공용)
interface ChgHstItem {
  bidNtceNo: string;
  bidNtceOrd?: string;
  chgNtceSeq?: string;
  chgNtceRsnNm?: string;
  chgNtceDt?: string;
  [k: string]: unknown;
}
async function upsertChgHst(items: ChgHstItem[], client: any): Promise<void> {
  for (const it of items) {
    if (!it.bidNtceNo) continue;
    const seq = parseInt(it.chgNtceSeq ?? "0", 10) || 0;
    const chgDate = it.chgNtceDt ? new Date(it.chgNtceDt.replace(" ", "T") + "+09:00") : null;
    await client.query(
      `
      INSERT INTO "AnnouncementChgHst" (id, "annId", "chgNtceSeq", "chgRsnNm", "chgDate", "rawJson")
      VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5::jsonb)
      ON CONFLICT ("annId", "chgNtceSeq") DO UPDATE SET
        "chgRsnNm" = EXCLUDED."chgRsnNm",
        "chgDate"  = EXCLUDED."chgDate",
        "rawJson"  = EXCLUDED."rawJson"
      `,
      [it.bidNtceNo, seq, it.chgNtceRsnNm ?? "", chgDate, JSON.stringify(it)],
    );
  }
}

// Frgcpt upsert: 외자 공고를 Announcement에 upsert
interface FrgcptItem {
  bidNtceNo: string;
  bidNtceOrd?: string;
  bidNtceNm?: string;
  ntceInsttNm?: string;
  dminsttNm?: string;
  bidNtceDt?: string;
  bidNtceBgn?: string;
  bidBeginDt?: string;
  bidClseDt?: string;
  opengDt?: string;
  presmptPrce?: string;
  bssamt?: string;
  sucsfbidLwltRate?: string;
  [k: string]: unknown;
}
async function upsertFrgcpt(items: FrgcptItem[], client: any): Promise<void> {
  for (const it of items) {
    if (!it.bidNtceNo) continue;
    const deadline = it.bidClseDt
      ? new Date(it.bidClseDt.replace(" ", "T") + "+09:00")
      : new Date("2099-12-31T23:59:59+09:00");
    const budget = BigInt(parseInt((it.presmptPrce ?? "0").replace(/[^0-9]/g, ""), 10) || 0);
    const bsisAmt = BigInt(parseInt((it.bssamt ?? "0").replace(/[^0-9]/g, ""), 10) || 0);
    const lwltRate = parseFloat(String(it.sucsfbidLwltRate ?? "").replace(/[^0-9.]/g, "")) || 0;

    await client.query(
      `
      INSERT INTO "Announcement" (id, "konepsId", title, "orgName", category, region, deadline, budget, "bsisAmt", "sucsfbidLwltRate", "rawJson", "createdAt")
      VALUES (gen_random_uuid()::text, $1, $2, $3, '외자', '전국', $4, $5::bigint, $6::bigint, $7, $8::jsonb, NOW())
      ON CONFLICT ("konepsId") DO UPDATE SET
        "budget"            = CASE WHEN EXCLUDED.budget > 0 THEN EXCLUDED.budget ELSE "Announcement".budget END,
        "bsisAmt"           = CASE WHEN EXCLUDED."bsisAmt" > 0 THEN EXCLUDED."bsisAmt" ELSE "Announcement"."bsisAmt" END,
        "sucsfbidLwltRate"  = CASE WHEN EXCLUDED."sucsfbidLwltRate" > 0 THEN EXCLUDED."sucsfbidLwltRate" ELSE "Announcement"."sucsfbidLwltRate" END,
        "rawJson"           = "Announcement"."rawJson" || EXCLUDED."rawJson"
      `,
      [
        it.bidNtceNo,
        it.bidNtceNm ?? "",
        it.ntceInsttNm ?? it.dminsttNm ?? "",
        deadline,
        budget.toString(),
        bsisAmt.toString(),
        lwltRate,
        JSON.stringify(it),
      ],
    );
  }
}

// PreStdrd: 사전규격 (신규 테이블 자동 생성)
interface PreStdrdItem {
  bfSpecRgstNo: string;
  bfSpecRgstNm?: string;
  rcptDt?: string;
  ntceInsttNm?: string;
  bfSpecRgstDt?: string;
  [k: string]: unknown;
}
async function ensurePreStdrdTable(client: any): Promise<void> {
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
async function upsertPreStdrd(items: PreStdrdItem[], client: any): Promise<void> {
  for (const it of items) {
    if (!it.bfSpecRgstNo) continue;
    const rcptDate = it.rcptDt ? new Date(it.rcptDt.replace(" ", "T") + "+09:00") : null;
    await client.query(
      `
      INSERT INTO "PreStdrd" ("bfSpecRgstNo", "bfSpecRgstNm", "rcptDt", "ntceInsttNm", "rawJson")
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT ("bfSpecRgstNo") DO UPDATE SET
        "bfSpecRgstNm" = EXCLUDED."bfSpecRgstNm",
        "rcptDt"       = EXCLUDED."rcptDt",
        "ntceInsttNm"  = EXCLUDED."ntceInsttNm",
        "rawJson"      = EXCLUDED."rawJson",
        "updatedAt"    = NOW()
      `,
      [it.bfSpecRgstNo, it.bfSpecRgstNm ?? "", rcptDate, it.ntceInsttNm ?? "", JSON.stringify(it)],
    );
  }
}

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
  const pool = new Pool({ connectionString: dbUrl, max: 2, statement_timeout: 0 });

  // PreStdrd 테이블 보장
  const init = await pool.connect();
  try { await ensurePreStdrdTable(init); } finally { init.release(); }

  const months: [number, number][] = [];
  let y = fromY, m = fromM;
  while (y < toY || (y === toY && m <= toM)) {
    months.push([y, m]);
    m++; if (m > 12) { m = 1; y++; }
  }
  console.log(`=== Bulk Missing APIs: ${fromArg} ~ ${toY}${String(toM).padStart(2, "0")} (${months.length}개월) ===\n`);

  const tStart = Date.now();
  for (let i = 0; i < months.length; i++) {
    const [yy, mm] = months[i];
    const last = daysInMonth(yy, mm);
    const bgn = fmtDt(yy, mm, 1, "0000");
    const end = fmtDt(yy, mm, last, "2359");
    const elapsed = ((Date.now() - tStart) / 1000 / 60).toFixed(1);
    console.log(`[${i + 1}/${months.length}] ${yy}-${String(mm).padStart(2, "0")} (경과 ${elapsed}분)`);

    const client = await pool.connect();
    try {
      // 1. ChgHstryServc
      const servc = await fetchAll<ChgHstItem>(
        "getBidPblancListInfoChgHstryServc",
        { inqryBgnDt: bgn, inqryEndDt: end },
        apiKey, "ChgHstryServc",
      );
      if (servc.length > 0) await upsertChgHst(servc, client);

      // 2. ChgHstryThng
      const thng = await fetchAll<ChgHstItem>(
        "getBidPblancListInfoChgHstryThng",
        { inqryBgnDt: bgn, inqryEndDt: end },
        apiKey, "ChgHstryThng",
      );
      if (thng.length > 0) await upsertChgHst(thng, client);

      // 3. Frgcpt
      const frg = await fetchAll<FrgcptItem>(
        "getBidPblancListInfoFrgcpt",
        { inqryBgnDt: bgn, inqryEndDt: end },
        apiKey, "Frgcpt",
      );
      if (frg.length > 0) await upsertFrgcpt(frg, client);

      // 4. PreStdrd 4종 (HrcspSsstndrdInfoService - 사전규격정보서비스)
      for (const preOp of [
        "getPublicPrcureThngInfoCnstwk",
        "getPublicPrcureThngInfoServc",
        "getPublicPrcureThngInfoThng",
        "getPublicPrcureThngInfoFrgcpt",
      ]) {
        try {
          const pre = await fetchAll<PreStdrdItem>(
            preOp,
            { inqryBgnDt: bgn, inqryEndDt: end },
            apiKey, preOp.replace("getPublicPrcureThngInfo", "PreStdrd"),
            BASE_HRCSP,
          );
          if (pre.length > 0) await upsertPreStdrd(pre, client);
        } catch (e) {
          // 과거 데이터 없는 월은 skip
        }
      }
    } catch (e) {
      console.error(`  ✗ ${yy}-${mm}: ${(e as Error).message}`);
    } finally {
      client.release();
    }
  }

  const totalMin = ((Date.now() - tStart) / 1000 / 60).toFixed(1);
  console.log(`\n=== Missing APIs 완료: ${totalMin}분 ===`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
