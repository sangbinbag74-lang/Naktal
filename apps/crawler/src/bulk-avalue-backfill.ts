/**
 * A값 전용 backfill — 2002~2014 공사 공고 (v1 처리 구간)
 * getBidPblancListInfoCnstwkBsisAmount 응답의 A값 필드 파싱해서
 * aValueTotal / aValueYn / aValueDetails 컬럼에 저장.
 *
 * v2 수정 전 v1으로 실행된 2002~2014 공고는 A값 파싱 안 됨 → 이 스크립트로 보완.
 *
 * 실행: pnpm ts-node src/bulk-avalue-backfill.ts [--from YYYYMM] [--to YYYYMM]
 * 기본: 200201 ~ 201412
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

async function fetchPage<T>(op: string, params: Record<string, string>, pageNo: number, apiKey: string): Promise<{ items: T[]; totalCount: number }> {
  const url = new URL(`${BASE}/${op}`);
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
      return { items: normalizeItems<T>(json.response?.body?.items), totalCount: json.response?.body?.totalCount ?? 0 };
    } catch (e) {
      if (retry === 2) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (retry + 1)));
    }
  }
  return { items: [], totalCount: 0 };
}

async function fetchAll<T>(op: string, params: Record<string, string>, apiKey: string): Promise<T[]> {
  const all: T[] = [];
  let pageNo = 1;
  while (true) {
    const { items, totalCount } = await fetchPage<T>(op, params, pageNo, apiKey);
    all.push(...items);
    if (pageNo === 1 && totalCount > 0) console.log(`    CnstwkBsisAmount: ${totalCount}건`);
    if (items.length < PAGE_SIZE) break;
    pageNo++;
    if (pageNo > 1000) break;
  }
  return all;
}

interface BsisAmountItem {
  bidNtceNo: string;
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

async function batchUpdateAValue(items: BsisAmountItem[], client: PoolClient): Promise<number> {
  if (items.length === 0) return 0;
  const toNum = (s: string | undefined) => parseInt((s ?? "0").replace(/[^0-9]/g, ""), 10) || 0;
  const seen = new Set<string>();
  const payload = items.filter(it => {
    if (!it.bidNtceNo || seen.has(it.bidNtceNo)) return false;
    seen.add(it.bidNtceNo);
    return true;
  }).map(it => {
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
    return {
      ann_id: it.bidNtceNo,
      a_total: aTotal,
      a_yn: it.bidPrceCalclAYn ?? "",
      a_details: details,
    };
  }).filter(x => x.a_total > 0 || x.a_yn !== "");
  if (payload.length === 0) return 0;

  const res = await client.query(
    `
    UPDATE "Announcement" a SET
      "aValueTotal"   = CASE WHEN v.a_total > 0 THEN v.a_total::bigint ELSE a."aValueTotal" END,
      "aValueYn"      = CASE WHEN v.a_yn != '' THEN v.a_yn ELSE a."aValueYn" END,
      "aValueDetails" = CASE WHEN v.a_total > 0 THEN v.a_details ELSE a."aValueDetails" END
    FROM jsonb_to_recordset($1::jsonb) AS v(ann_id text, a_total bigint, a_yn text, a_details jsonb)
    WHERE a."konepsId" = v.ann_id
    `,
    [JSON.stringify(payload)],
  );
  return res.rowCount ?? 0;
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
  const fromArg = args.find((a) => a.startsWith("--from="))?.slice(7) ?? "200201";
  const toArg = args.find((a) => a.startsWith("--to="))?.slice(5) ?? "201412";
  const [fromY, fromM] = parseYYYYMM(fromArg);
  const [toY, toM] = parseYYYYMM(toArg);

  const { dbUrl, apiKey } = loadEnv();
  const pool = new Pool({ connectionString: dbUrl, max: 2, statement_timeout: 0 });

  const months: [number, number][] = [];
  let y = fromY, m = fromM;
  while (y < toY || (y === toY && m <= toM)) {
    months.push([y, m]);
    m++; if (m > 12) { m = 1; y++; }
  }
  console.log(`=== A값 Backfill (공사 BsisAmount 재파싱): ${fromArg}~${toArg} (${months.length}개월) ===\n`);

  const tStart = Date.now();
  let totalA = 0;
  for (let i = 0; i < months.length; i++) {
    const [yy, mm] = months[i];
    const last = daysInMonth(yy, mm);
    const bgn = fmtDt(yy, mm, 1, "0000");
    const end = fmtDt(yy, mm, last, "2359");
    const mT0 = Date.now();

    const client = await pool.connect();
    try {
      const items = await fetchAll<BsisAmountItem>("getBidPblancListInfoCnstwkBsisAmount", { inqryBgnDt: bgn, inqryEndDt: end }, apiKey);
      const updated = items.length > 0 ? await batchUpdateAValue(items, client) : 0;
      totalA += updated;
      const mElapsed = ((Date.now() - mT0) / 1000).toFixed(1);
      const totalMin = ((Date.now() - tStart) / 1000 / 60).toFixed(1);
      const pct = ((i + 1) / months.length * 100).toFixed(1);
      console.log(`[${i + 1}/${months.length}] ${yy}-${String(mm).padStart(2, "0")} (${mElapsed}초) | A값 +${updated} | 누적 ${totalA} | 전체 ${totalMin}분 (${pct}%)`);
    } catch (e) {
      console.error(`  ✗ ${yy}-${mm}: ${(e as Error).message}`);
    } finally {
      client.release();
    }
  }

  console.log(`\n=== A값 Backfill 완료: ${totalA.toLocaleString()}건, ${((Date.now() - tStart) / 1000 / 60).toFixed(1)}분 ===`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
