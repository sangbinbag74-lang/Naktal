/**
 * Phase C: 개찰결과 bulk 수집 (복수예가 15개, CORE 2 핵심)
 *
 * API: getOpengResultListInfo{Cnstwk,Servc,Thng,Frgcpt}
 * 저장: BidOpeningDetail 테이블
 *
 * 실행: pnpm ts-node src/bulk-opening.ts [--from YYYYMM] [--to YYYYMM]
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

const BASE = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";
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
): Promise<{ items: T[]; totalCount: number }> {
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
): Promise<T[]> {
  // 페이지 batch(10) + retry 패턴 (검증된 가속, feedback_recollect_acceleration.md)
  const r1 = await fetchPage<T>(op, params, 1, apiKey);
  console.log(`    ${label}: ${r1.totalCount}건`);
  if (r1.totalCount === 0 || r1.items.length === 0) return [];

  const totalPages = Math.min(1000, Math.ceil(r1.totalCount / PAGE_SIZE));
  const all: T[] = [...r1.items];
  if (totalPages <= 1) return all;

  const BATCH = 7;
  for (let batchStart = 2; batchStart <= totalPages; batchStart += BATCH) {
    const batchPages: number[] = [];
    for (let p = batchStart; p < batchStart + BATCH && p <= totalPages; p++) batchPages.push(p);
    const batchResults = await Promise.all(batchPages.map(async (p) => {
      try {
        return await fetchPage<T>(op, params, p, apiKey);
      } catch (e) {
        await new Promise((rs) => setTimeout(rs, 1000));
        try {
          return await fetchPage<T>(op, params, p, apiKey);
        } catch (e2) {
          console.error(`    [${op}] page ${p} 2회 실패: ${(e2 as Error).message}`);
          return { items: [] as T[], totalCount: r1.totalCount };
        }
      }
    }));
    for (const r of batchResults) all.push(...r.items);
  }
  return all;
}

interface OpengItem {
  bidNtceNo: string;
  bidNtceOrd?: string;
  rlOpengDt?: string;
  opengDt?: string;
  bssamt?: string;
  sucsfbidLwltRate?: string;
  sucsfbidAmt?: string;
  bidwinnrNm?: string;
  rlOpengRank?: string;
  prdprcList?: Array<{ prdprcOrd?: string; prdprcAmt?: string }>;
  [k: string]: unknown;
}

async function upsertOpeningByAnn(items: OpengItem[], client: any): Promise<void> {
  const byAnn = new Map<string, OpengItem[]>();
  for (const it of items) {
    if (!it.bidNtceNo) continue;
    const arr = byAnn.get(it.bidNtceNo) ?? [];
    arr.push(it);
    byAnn.set(it.bidNtceNo, arr);
  }
  if (byAnn.size === 0) return;

  const records: Array<{
    ann_id: string;
    prdprc_list: Array<{ order: number; amt: number; raw: OpengItem }>;
    opening_date: string | null;
    bid_count: number;
    sucsfbid_rate: number | null;
    raw_json: OpengItem[];
  }> = [];
  for (const [annId, arr] of byAnn) {
    const first = arr[0];
    const prdprcList = arr.map((x) => ({
      order: parseInt(String(x.rlOpengRank ?? x.prdprcList?.[0]?.prdprcOrd ?? "0"), 10) || 0,
      amt: parseInt(String(x.sucsfbidAmt ?? "").replace(/[^0-9]/g, ""), 10) || 0,
      raw: x,
    }));
    const dt = first.rlOpengDt ?? first.opengDt;
    const openingDate = dt ? new Date(dt.replace(" ", "T") + "+09:00").toISOString() : null;
    const sucsfbidRate = parseFloat(String(first.sucsfbidLwltRate ?? "").replace(/[^0-9.]/g, "")) || null;
    records.push({
      ann_id: annId,
      prdprc_list: prdprcList,
      opening_date: openingDate,
      bid_count: arr.length,
      sucsfbid_rate: sucsfbidRate,
      raw_json: arr,
    });
  }

  const CHUNK = 500;
  for (let i = 0; i < records.length; i += CHUNK) {
    const slice = records.slice(i, i + CHUNK);
    await client.query(
      `
      INSERT INTO "BidOpeningDetail"
        (id, "annId", "prdprcList", "selPrdprcIdx", "openingDate", "bidCount", "sucsfbidRate", "rawJson", "createdAt", "updatedAt")
      SELECT
        gen_random_uuid()::text,
        v.ann_id,
        v.prdprc_list,
        '{}'::int[],
        v.opening_date::timestamptz,
        v.bid_count,
        v.sucsfbid_rate,
        v.raw_json,
        NOW(), NOW()
      FROM jsonb_to_recordset($1::jsonb) AS v(
        ann_id text,
        prdprc_list jsonb,
        opening_date text,
        bid_count int,
        sucsfbid_rate float8,
        raw_json jsonb
      )
      ON CONFLICT ("annId") DO UPDATE SET
        "prdprcList" = CASE
          WHEN jsonb_array_length(EXCLUDED."prdprcList") > jsonb_array_length("BidOpeningDetail"."prdprcList")
          THEN EXCLUDED."prdprcList" ELSE "BidOpeningDetail"."prdprcList" END,
        "openingDate" = COALESCE(EXCLUDED."openingDate", "BidOpeningDetail"."openingDate"),
        "bidCount" = GREATEST(EXCLUDED."bidCount", "BidOpeningDetail"."bidCount"),
        "sucsfbidRate" = COALESCE(EXCLUDED."sucsfbidRate", "BidOpeningDetail"."sucsfbidRate"),
        "rawJson" = EXCLUDED."rawJson",
        "updatedAt" = NOW()
      `,
      [JSON.stringify(slice)],
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

  const months: [number, number][] = [];
  let y = fromY, m = fromM;
  while (y < toY || (y === toY && m <= toM)) {
    months.push([y, m]);
    m++; if (m > 12) { m = 1; y++; }
  }
  console.log(`=== Bulk Opening 수집 (복수예가 4종): ${fromArg} ~ ${toY}${String(toM).padStart(2, "0")} (${months.length}개월) ===\n`);

  const OPS = [
    "getOpengResultListInfoCnstwk",
    "getOpengResultListInfoServc",
    "getOpengResultListInfoThng",
    "getOpengResultListInfoFrgcpt",
  ];

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
      // 4 op 병렬 fetch (G2B rate 무제한, 2026-05-06)
      const opResults = await Promise.all(OPS.map((op) =>
        fetchAll<OpengItem>(
          op,
          { inqryBgnDt: bgn, inqryEndDt: end },
          apiKey,
          op.replace("getOpengResultListInfo", ""),
        ),
      ));
      for (const items of opResults) {
        if (items.length > 0) await upsertOpeningByAnn(items, client);
      }
    } catch (e) {
      console.error(`  ✗ ${yy}-${mm}: ${(e as Error).message}`);
    } finally {
      client.release();
    }
  }

  const totalMin = ((Date.now() - tStart) / 1000 / 60).toFixed(1);
  console.log(`\n=== Opening 완료: ${totalMin}분 ===`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
