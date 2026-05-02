/**
 * Phase G-1: 복수예가 상세 bulk 수집 (15개 예비가 + 선택된 4개 번호)
 *
 * API: getOpengResultListInfo{Thng,Cnstwk,Servc,Frgcpt}PreparPcDetail
 * 한 공고당 15행 반환 (compnoRsrvtnPrceSno 1~15),
 *   drwtYn="Y"인 4행 → selPrdprcIdx
 *   각 행의 bsisPlnprc → prdprcList 15개 금액
 *
 * 저장: BidOpeningDetail 테이블에 UPSERT
 *   prdprcList: [{sno, amt, drwt}, ...] 15개
 *   selPrdprcIdx: int[] (drwtYn=Y인 sno, 보통 4개)
 *
 * 실행: pnpm ts-node src/bulk-opening-preparpc.ts [--from YYYYMM] [--to YYYYMM]
 */
import { Pool, type PoolClient } from "pg";
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
      if (v && !/[가-힣]/.test(v)) env[k] = v;
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

  for (let retry = 0; retry < 4; retry++) {
    const ac = new AbortController();
    // 전체 hard cap: 180s — fetch 헤더 + body stream 합산 한도
    const hardTimer = setTimeout(() => ac.abort(), 180000);
    let watchdog: NodeJS.Timeout | null = null;
    try {
      // 1단계: fetch 헤더 응답 — Kong upstream latency 13.9s 측정값 + 마진 = 60s 한도 (별도 timer)
      const headerTimer = setTimeout(() => ac.abort(), 60000);
      const res = await fetch(url, { signal: ac.signal });
      clearTimeout(headerTimer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("no body stream");
      // 2단계: body stream — chunk 간격 10s stall 감지 (헤더 도착 후 활성화)
      const STALL_MS = 10000;
      let lastChunk = Date.now();
      watchdog = setInterval(() => {
        if (Date.now() - lastChunk > STALL_MS) {
          ac.abort();
          if (watchdog) { clearInterval(watchdog); watchdog = null; }
        }
      }, 1000);
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          lastChunk = Date.now();
        }
      }
      if (watchdog) { clearInterval(watchdog); watchdog = null; }
      clearTimeout(hardTimer);
      const totalLen = chunks.reduce((s, c) => s + c.byteLength, 0);
      if (totalLen === 0) throw new Error("empty body");
      const buf = Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength)), totalLen);
      const text = buf.toString("utf-8");
      let json: G2BResponse<T>;
      try { json = JSON.parse(text) as G2BResponse<T>; }
      catch { throw new Error(`JSON parse fail: ${text.slice(0, 100)}`); }
      const code = json.response?.header?.resultCode;
      if (code && code !== "00") throw new Error(`${code}: ${json.response?.header?.resultMsg}`);
      const items = normalizeItems<T>(json.response?.body?.items);
      const totalCount = json.response?.body?.totalCount ?? 0;
      return { items, totalCount };
    } catch (e) {
      if (watchdog) { clearInterval(watchdog); watchdog = null; }
      clearTimeout(hardTimer);
      if (retry === 3) throw e;
      console.error(`    [${op} p${pageNo}] retry ${retry + 1}: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 1500 * (retry + 1)));
    }
  }
  return { items: [], totalCount: 0 };
}

async function fetchAll<T>(
  op: string,
  baseParams: Record<string, string>,
  apiKey: string,
  label: string,
): Promise<T[]> {
  const all: T[] = [];
  let pageNo = 1;
  let totalCount = 0;
  while (true) {
    const { items, totalCount: tc } = await fetchPage<T>(op, baseParams, pageNo, apiKey);
    if (pageNo === 1) totalCount = tc;
    all.push(...items);
    if (pageNo === 1) console.log(`    ${label}: ${totalCount}건 (예상 ${Math.ceil(totalCount / PAGE_SIZE)}페이지)`);
    else if (pageNo % 5 === 0) console.log(`    ${label} p${pageNo} 누적 ${all.length}`);
    if (items.length < PAGE_SIZE) break;
    pageNo++;
    if (pageNo > 1000) { console.error(`    [${op}] 1000페이지 초과 중단`); break; }
  }
  console.log(`    ${label} 페치 완료: ${all.length}건`);
  return all;
}

interface PreparPcItem {
  bidNtceNo: string;
  bidNtceOrd?: string;
  bidClsfcNo?: string;
  rbidNo?: string;
  bidNtceNm?: string;
  plnprc?: string;              // 확정 예정가격
  bssamt?: string;              // 기초금액
  totRsrvtnPrceNum?: string;    // "15"
  compnoRsrvtnPrceSno?: string; // 1~15
  bsisPlnprc?: string;          // 해당 순번의 예비가
  drwtYn?: string;              // Y/N
  drwtNum?: string;
  rlOpengDt?: string;
  [k: string]: unknown;
}

async function upsertByAnn(items: PreparPcItem[], client: PoolClient): Promise<{ anns: number; selected: number }> {
  const byKey = new Map<string, PreparPcItem[]>();
  for (const it of items) {
    if (!it.bidNtceNo || !it.compnoRsrvtnPrceSno) continue;
    const key = it.bidNtceNo;
    const arr = byKey.get(key) ?? [];
    arr.push(it);
    byKey.set(key, arr);
  }
  if (byKey.size === 0) return { anns: 0, selected: 0 };

  const records: Array<{
    ann_id: string;
    prdprc_list: Array<{ sno: number; amt: number; drwt: boolean }>;
    sel_prdprc_idx: number[];
    opening_date: string | null;
    raw_json: { plnprc: number; items: PreparPcItem[] };
  }> = [];
  let selectedTotal = 0;
  for (const [annId, arr] of byKey) {
    const prdprcList = arr
      .map((x) => ({
        sno: parseInt(x.compnoRsrvtnPrceSno ?? "0", 10),
        amt: parseInt(String(x.bsisPlnprc ?? "").replace(/[^0-9]/g, ""), 10) || 0,
        drwt: x.drwtYn === "Y",
      }))
      .filter((p) => p.sno > 0)
      .sort((a, b) => a.sno - b.sno);
    const selPrdprcIdx = prdprcList.filter((p) => p.drwt).map((p) => p.sno);
    selectedTotal += selPrdprcIdx.length;
    const first = arr[0];
    const plnprc = parseInt(String(first?.plnprc ?? "").replace(/[^0-9]/g, ""), 10) || 0;
    const dt = first?.rlOpengDt;
    const openingDate = dt ? new Date(dt.replace(" ", "T") + "+09:00").toISOString() : null;
    records.push({
      ann_id: annId,
      prdprc_list: prdprcList,
      sel_prdprc_idx: selPrdprcIdx,
      opening_date: openingDate,
      raw_json: { plnprc, items: arr },
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
        v.sel_prdprc_idx,
        v.opening_date,
        0,
        NULL,
        v.raw_json,
        NOW(),
        NOW()
      FROM jsonb_to_recordset($1::jsonb)
        AS v(ann_id text, prdprc_list jsonb, sel_prdprc_idx int[], opening_date timestamptz, raw_json jsonb)
      ON CONFLICT ("annId") DO UPDATE SET
        "prdprcList"   = EXCLUDED."prdprcList",
        "selPrdprcIdx" = EXCLUDED."selPrdprcIdx",
        "openingDate"  = COALESCE(EXCLUDED."openingDate", "BidOpeningDetail"."openingDate"),
        "rawJson"      = EXCLUDED."rawJson",
        "updatedAt"    = NOW()
      `,
      [JSON.stringify(slice)],
    );
  }

  return { anns: byKey.size, selected: selectedTotal };
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
  console.log(`=== Bulk PreparPc 수집 (복수예가 15개 + 선택 4개): ${fromArg} ~ ${toY}${String(toM).padStart(2, "0")} (${months.length}개월) ===\n`);

  const OPS = [
    "getOpengResultListInfoCnstwkPreparPcDetail",
    "getOpengResultListInfoServcPreparPcDetail",
    "getOpengResultListInfoThngPreparPcDetail",
    "getOpengResultListInfoFrgcptPreparPcDetail",
  ];

  const tStart = Date.now();
  let totalAnn = 0;
  let totalSel = 0;

  for (let i = 0; i < months.length; i++) {
    const [yy, mm] = months[i];
    const last = daysInMonth(yy, mm);
    const bgn = fmtDt(yy, mm, 1, "0000");
    const end = fmtDt(yy, mm, last, "2359");
    const elapsed = ((Date.now() - tStart) / 1000 / 60).toFixed(1);
    console.log(`[${i + 1}/${months.length}] ${yy}-${String(mm).padStart(2, "0")} (경과 ${elapsed}분, 누적 ${totalAnn} 공고 / ${totalSel} 선택)`);

    const client = await pool.connect();
    let monthAnns = 0, monthSel = 0;
    try {
      // 4 ops 병렬 fetch (API 페이지당 20-35s — 순차 시 9일+ 소요)
      const tFetch = Date.now();
      const labels = OPS.map((op) => op.replace("getOpengResultListInfo", "").replace("PreparPcDetail", ""));
      const fetchResults = await Promise.all(OPS.map((op, idx) =>
        fetchAll<PreparPcItem>(op, { inqryBgnDt: bgn, inqryEndDt: end }, apiKey, labels[idx])
          .catch((e) => { console.error(`  ✗ ${op}: ${(e as Error).message}`); return [] as PreparPcItem[]; })
      ));
      console.log(`    [fetch 4-ops] ${((Date.now()-tFetch)/1000).toFixed(1)}s 완료 — ${fetchResults.map((r,i)=>`${labels[i]}=${r.length}`).join(", ")}`);
      for (let k = 0; k < fetchResults.length; k++) {
        const items = fetchResults[k];
        if (items.length > 0) {
          const tU = Date.now();
          const { anns, selected } = await upsertByAnn(items, client);
          console.log(`    ${labels[k]} UPSERT 완료: ${anns} 공고 / ${selected} 선택 (${((Date.now()-tU)/1000).toFixed(1)}s)`);
          monthAnns += anns;
          monthSel += selected;
        }
      }
      totalAnn += monthAnns;
      totalSel += monthSel;
      // 월별 DB 검증 — 실제 채움 카운트 확인
      const monthStart = `${yy}-${String(mm).padStart(2, "0")}-01`;
      const nextY = mm === 12 ? yy + 1 : yy;
      const nextM = mm === 12 ? 1 : mm + 1;
      const monthEnd = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
      const v = await client.query(
        `SELECT COUNT(*) FILTER (WHERE array_length("selPrdprcIdx",1)>=4)::bigint AS f, COUNT(*)::bigint AS t FROM "BidOpeningDetail" WHERE "openingDate" >= $1::timestamptz AND "openingDate" < $2::timestamptz`,
        [monthStart, monthEnd],
      );
      const f = Number(v.rows[0].f), t = Number(v.rows[0].t);
      const pct = t > 0 ? (f/t*100).toFixed(1) : "0.0";
      console.log(`  ✓ ${yy}-${String(mm).padStart(2,"0")} 검증: DB ${f}/${t} (${pct}%) — 이번 월 ${monthAnns} 공고/${monthSel} 선택`);
      if (t > 0 && f === 0 && monthAnns === 0) {
        console.error(`  🔴 ${yy}-${mm} 0건 처리 — API 실패 추정. 다음 월 진행은 의미 없음. 종료.`);
        break;
      }
    } catch (e) {
      console.error(`  ✗ ${yy}-${mm}: ${(e as Error).message}`);
    } finally {
      client.release();
    }
  }

  const totalMin = ((Date.now() - tStart) / 1000 / 60).toFixed(1);
  console.log(`\n=== PreparPc 완료: ${totalMin}분, ${totalAnn} 공고 / ${totalSel} 선택 번호 ===`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
