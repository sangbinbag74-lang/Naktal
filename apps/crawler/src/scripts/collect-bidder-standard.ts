/**
 * Phase 1 — 입찰자 전체 투찰가 수집 (표준서비스 getDataSetOpnStdScsbidInfo bulk) → E드라이브 JSONL
 * 박상빈님 2026-06-05 플랜 (PLAN-bidder-local-ml-20260605.md).
 *  - 공사(bsnsDivCd=3) 전구간(2002~현재), 개찰일 1주씩, numOfRows=999
 *  - 페이지 batch 30 + retry(1회), 재시작 가능(완료 주 skip)
 *  - 페이지 NULL 즉시 보고, 주별 행수 로그 (E:\naktal-bidder\progress.log)
 *  - DB 적재 0 (파일만) — Supabase 무영향, 비용 0
 */
import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(__dirname, "../../../../.env");
const env = fs.readFileSync(envPath, "utf-8");
function val(n: string): string {
  const l = env.split("\n").find((x) => x.startsWith(n + "="));
  return l ? l.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "") : "";
}
const KEY = val("KONEPS_API_KEY") || val("G2B_API_KEY");

const BASE = "https://apis.data.go.kr/1230000/ao/PubDataOpnStdService";
const OP = "getDataSetOpnStdScsbidInfo";
const ROOT = "E:\\naktal-bidder";
const OUTDIR = path.join(ROOT, "cnstwk");
const LOGFILE = path.join(ROOT, "progress.log");
fs.mkdirSync(OUTDIR, { recursive: true });

function plog(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOGFILE, line + "\n"); } catch { /* */ }
}
function pad(n: number) { return String(n).padStart(2, "0"); }
function ymd(d: Date) { return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchPage(bgn: string, end: string, p: number): Promise<{ ok: boolean; total: number; items: any[] }> {
  const u = `${BASE}/${OP}?serviceKey=${KEY}&type=json&bsnsDivCd=3&opengBgnDt=${bgn}&opengEndDt=${end}&numOfRows=999&pageNo=${p}`;
  for (let retry = 0; retry < 2; retry++) {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(40000) });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const j = (await res.json()) as any;
      if (j?.response?.header?.resultCode !== "00") return { ok: false, total: 0, items: [] };
      let items = j?.response?.body?.items ?? [];
      if (!Array.isArray(items)) items = items?.item ? (Array.isArray(items.item) ? items.item : [items.item]) : [];
      return { ok: true, total: Number(j?.response?.body?.totalCount ?? 0), items };
    } catch {
      if (retry === 0) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return { ok: false, total: 0, items: [] };
}

async function collectWeek(label: string, bgn: string, end: string): Promise<{ rows: number; fail: number; skipped?: boolean }> {
  const outPath = path.join(OUTDIR, label + ".jsonl");
  const donePath = path.join(OUTDIR, label + ".done");
  if (fs.existsSync(donePath)) return { rows: 0, fail: 0, skipped: true }; // 완료 주 skip (재시작)

  const r1 = await fetchPage(bgn, end, 1);
  if (!r1.ok) { plog(`⚠️ ${label} page1 실패 (재시도 대상)`); return { rows: 0, fail: 1 }; }
  if (r1.total === 0) { fs.writeFileSync(donePath, "0"); return { rows: 0, fail: 0 }; } // 빈 주 = done(0)

  const totalPages = Math.ceil(r1.total / 999);
  const out = fs.createWriteStream(outPath);
  let rows = 0, fail = 0;

  // NULL 즉시 보고 (첫 페이지)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nullCnt = r1.items.filter((i: any) => !i.bidNtceNo || !i.bidprcAmt).length;
  if (nullCnt > r1.items.length * 0.1) plog(`⚠️ ${label} page1 NULL ${nullCnt}/${r1.items.length}`);
  for (const it of r1.items) { out.write(JSON.stringify(it) + "\n"); rows++; }

  const BATCH = 30;
  for (let s = 2; s <= totalPages; s += BATCH) {
    const ps: number[] = [];
    for (let p = s; p < s + BATCH && p <= totalPages; p++) ps.push(p);
    const rs = await Promise.all(ps.map((p) => fetchPage(bgn, end, p)));
    for (const r of rs) {
      if (r.ok) { for (const it of r.items) { out.write(JSON.stringify(it) + "\n"); rows++; } }
      else fail++;
    }
  }
  await new Promise<void>((res) => out.end(res));
  // 페이지 누락 검증: 받은 행 vs totalCount
  if (rows < r1.total * 0.95) plog(`⚠️ ${label} 누락 의심: 받음 ${rows} / 기대 ${r1.total} (fail ${fail})`);
  fs.writeFileSync(donePath, String(rows));
  return { rows, fail };
}

(async () => {
  if (!KEY) { plog("KEY 없음"); process.exit(1); }
  const start = new Date(2002, 0, 1);
  const today = new Date();
  const weeks: { label: string; bgn: string; end: string }[] = [];
  for (const d = new Date(start); d <= today; d.setDate(d.getDate() + 7)) {
    const ws = new Date(d);
    const we = new Date(d); we.setDate(we.getDate() + 6);
    weeks.push({ label: ymd(ws), bgn: ymd(ws) + "0000", end: ymd(we) + "2359" });
  }
  plog(`=== Phase1 수집 시작: 공사 ${weeks.length}주 (2002-01 ~ 현재) → ${OUTDIR} ===`);
  const t0 = Date.now();
  let totalRows = 0, done = 0, skip = 0, fails = 0, dataWeeks = 0;
  for (const w of weeks) {
    const r = await collectWeek(w.label, w.bgn, w.end);
    done++;
    if (r.skipped) { skip++; continue; }
    totalRows += r.rows; fails += r.fail;
    if (r.rows > 0) dataWeeks++;
    if (done % 20 === 0 || r.rows > 50000) {
      const min = ((Date.now() - t0) / 1000 / 60).toFixed(1);
      plog(`  [${done}/${weeks.length}] ${w.label}: ${r.rows.toLocaleString()}행 | 누적 ${totalRows.toLocaleString()}행 / 데이터주 ${dataWeeks} / skip ${skip} / fail ${fails} / ${min}분`);
    }
  }
  plog(`=== Phase1 완료: ${totalRows.toLocaleString()}행, 데이터주 ${dataWeeks}/${weeks.length}, fail ${fails}, ${((Date.now() - t0) / 1000 / 60).toFixed(1)}분 ===`);
  process.exit(0);
})();
