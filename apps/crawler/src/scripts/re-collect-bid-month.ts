/**
 * 옵션 A 재수집 — BidResult 1단계 모집 (모집·분석·적재 3단계 분리)
 *
 * 단일 월 × 4 SCSBID op (Thng/Cnstwk/Servc/Frgcpt), inqryDiv=1, JSONL 적재.
 * - DB INSERT 0회
 * - 페이지마다 nullity check (bidNtceNo / sucsfbidAmt / sucsfbidRate) → stdout 즉시 보고
 * - 일일 호출 카운터 공유
 *
 * 실행: ts-node src/scripts/re-collect-bid-month.ts --ym 200703
 */

import * as path from "path";
import * as fs from "fs";

(function loadEnv() {
  const candidates = [
    path.resolve(__dirname, "../../../web/.env.local"),
    path.resolve(__dirname, "../../../../.env"),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const c = fs.readFileSync(p, "utf-8");
    for (const l of c.split("\n")) {
      const t = l.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (!k) continue;
      if (v.includes("[YOUR-PASSWORD]") || v.includes("your-project")) continue;
      if (!process.env[k]) process.env[k] = v;
    }
  }
})();

const KEY = process.env.G2B_API_KEY || process.env.KONEPS_API_KEY || "";
if (!KEY) { console.error("G2B_API_KEY 누락"); process.exit(1); }

const BASE = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";
const OPS = [
  "getScsbidListSttusThng",
  "getScsbidListSttusCnstwk",
  "getScsbidListSttusServc",
  "getScsbidListSttusFrgcpt",
] as const;
type Op = typeof OPS[number];

const CACHE_DIR = path.resolve(__dirname, "../../.recollect-cache");
fs.mkdirSync(CACHE_DIR, { recursive: true });

const DAILY_LIMIT = parseInt(process.env.KONEPS_DAILY_LIMIT_REAL || "100000", 10);
const QUOTA_GUARD = 200;

function parseArgs() {
  const args = process.argv.slice(2);
  let ym = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--ym" && args[i + 1]) ym = args[i + 1];
  }
  if (!/^\d{6}$/.test(ym)) { console.error("Usage: --ym YYYYMM"); process.exit(1); }
  return { ym };
}

function lastDay(ym: string): string {
  const y = parseInt(ym.slice(0, 4));
  const m = parseInt(ym.slice(4, 6));
  const d = new Date(y, m, 0).getDate();
  return `${ym}${String(d).padStart(2, "0")}`;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function quotaPath(): string { return path.join(CACHE_DIR, `quota-${todayKey()}.json`); }
function readQuota(): number { try { return JSON.parse(fs.readFileSync(quotaPath(), "utf-8")).count ?? 0; } catch { return 0; } }
function writeQuota(n: number) { fs.writeFileSync(quotaPath(), JSON.stringify({ date: todayKey(), count: n })); }
function quotaRemaining(): number { return DAILY_LIMIT - readQuota(); }

interface NullityIssue { type: string; count: number; sample?: any; }

function checkPage(items: any[]): NullityIssue[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  const issues: NullityIssue[] = [];
  let nullId = 0, nullAmt = 0, nullRate = 0;
  let firstId: any = null, firstAmt: any = null, firstRate: any = null;
  for (const it of items) {
    if (!it.bidNtceNo || String(it.bidNtceNo).trim() === "") {
      nullId++;
      if (!firstId) firstId = it;
    }
    const amt = String(it.sucsfbidAmt ?? "").replace(/[^0-9]/g, "");
    if (!amt || amt === "0") {
      nullAmt++;
      if (!firstAmt) firstAmt = it;
    }
    const rate = String(it.sucsfbidRate ?? "").replace(/[^0-9.]/g, "");
    if (!rate || parseFloat(rate) === 0) {
      nullRate++;
      if (!firstRate) firstRate = it;
    }
  }
  if (nullId > 0) issues.push({ type: "NULL_BIDNTCENO", count: nullId, sample: firstId });
  if (nullAmt > 0) issues.push({ type: "NULL_SUCSFBIDAMT", count: nullAmt, sample: firstAmt });
  if (nullRate > 0) issues.push({ type: "NULL_SUCSFBIDRATE", count: nullRate, sample: firstRate });
  return issues;
}

async function fetchPage(op: Op, ym: string, pageNo: number, numOfRows: number) {
  const from = `${ym.slice(0, 4)}${ym.slice(4, 6)}010000`;
  const to = `${lastDay(ym)}2359`;
  const u = `${BASE}/${op}?serviceKey=${encodeURIComponent(KEY)}&inqryDiv=1&inqryBgnDt=${from}&inqryEndDt=${to}&numOfRows=${numOfRows}&pageNo=${pageNo}&type=json`;
  let raw = "";
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(60_000) });
    raw = await r.text();
    if (!r.ok) return { ok: false, items: [], totalCount: 0, resultCode: `HTTP_${r.status}`, resultMsg: `HTTP ${r.status}` };
    let parsed: any;
    try { parsed = JSON.parse(raw); }
    catch { return { ok: false, items: [], totalCount: 0, resultCode: "JSON_PARSE", resultMsg: "JSON parse fail" }; }
    const code = parsed?.response?.header?.resultCode ?? parsed?.["nkoneps.com.response.ResponseError"]?.header?.resultCode ?? "??";
    const msg = parsed?.response?.header?.resultMsg ?? "?";
    const body = parsed?.response?.body;
    const tc = body?.totalCount ?? 0;
    const rawItems = body?.items;
    let items: any[] = [];
    if (Array.isArray(rawItems)) items = rawItems;
    else if (rawItems && typeof rawItems === "object" && "item" in rawItems) {
      const x = rawItems.item;
      items = Array.isArray(x) ? x : (x ? [x] : []);
    }
    return { ok: code === "00", items, totalCount: tc, resultCode: code, resultMsg: msg };
  } catch (e) {
    return { ok: false, items: [], totalCount: 0, resultCode: "FETCH_ERR", resultMsg: String(e).slice(0, 200) };
  }
}

(async () => {
  const { ym } = parseArgs();
  const NUM = 100; // SCSBID는 numOfRows=100 권장 (응답 크기)

  const remStart = quotaRemaining();
  console.log(`[start] bid ym=${ym} | 일일 한도 잔여=${remStart} / 한도=${DAILY_LIMIT}`);
  if (remStart < QUOTA_GUARD) {
    console.error(`잔여 호출 ${remStart} < ${QUOTA_GUARD} — abort`);
    process.exit(2);
  }

  const summary: Record<Op, { totalCount: number; pages: number; saved: number; issues: NullityIssue[] }> = {} as any;
  let abortReason = "";

  // 4 op 병렬 + op 안의 모든 페이지 병렬 (G2B rate limit 무제한, 2026-05-06)
  const opTasks = OPS.map(async (op) => {
    const fp = path.join(CACHE_DIR, `${ym}-bid-${op}.jsonl`);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    const w = fs.createWriteStream(fp, { flags: "a" });

    const issuesAcc: NullityIssue[] = [];

    const r1 = await fetchPage(op, ym, 1, NUM);
    writeQuota(readQuota() + 1);

    if (!r1.ok) {
      if (r1.resultCode === "07") {
        console.log(`  [${op}] empty (resultCode=07)`);
      } else if (/HTTP_5\d{2}/.test(r1.resultCode)) {
        console.error(`⚠️ ${ym}-${op} page=1 | HTTP 장애: ${r1.resultCode}`);
        abortReason = `HTTP 장애: ${r1.resultCode}`;
      } else {
        console.error(`⚠️ ${ym}-${op} page=1 | code=${r1.resultCode} | msg=${r1.resultMsg.slice(0, 100)}`);
      }
      w.end();
      summary[op] = { totalCount: 0, pages: 0, saved: 0, issues: issuesAcc };
      return;
    }

    const totalCount = r1.totalCount;
    const totalPages = totalCount > 0 ? Math.ceil(totalCount / NUM) : 1;

    const allResults: Array<{ page: number; items: any[]; ok: boolean }> = [
      { page: 1, items: r1.items, ok: true },
    ];
    const BATCH = 10;
    let totalCalls = 0;
    for (let batchStart = 2; batchStart <= totalPages; batchStart += BATCH) {
      const batchPages: number[] = [];
      for (let p = batchStart; p < batchStart + BATCH && p <= totalPages; p++) batchPages.push(p);
      const batchResults = await Promise.all(
        batchPages.map(async (p) => {
          let r = await fetchPage(op, ym, p, NUM);
          totalCalls++;
          if (!r.ok && r.resultCode !== "07") {
            await new Promise(rs => setTimeout(rs, 1000));
            const r2 = await fetchPage(op, ym, p, NUM);
            totalCalls++;
            if (r2.ok) r = r2;
          }
          return { page: p, items: r.items, ok: r.ok, resultCode: r.resultCode };
        }),
      );
      for (const r of batchResults) allResults.push(r);
    }
    writeQuota(readQuota() + totalCalls);
    if (totalPages > 1) console.log(`  [${op}] page batch: ${totalPages} pages, ${totalCalls} calls | totalCount=${totalCount}`);

    let saved = 0;
    let pagesOk = 0;
    for (const r of allResults) {
      if (!r.ok) continue;
      pagesOk++;
      const issues = checkPage(r.items);
      for (const iss of issues) {
        const sampleStr = iss.sample ? JSON.stringify(iss.sample).slice(0, 200) : "";
        console.error(`⚠️ ${ym}-${op} p=${r.page} | ${iss.type} count=${iss.count} | ${sampleStr}`);
        const accIdx = issuesAcc.findIndex((x) => x.type === iss.type);
        if (accIdx === -1) issuesAcc.push({ ...iss });
        else issuesAcc[accIdx].count += iss.count;
      }
      for (const it of r.items) {
        w.write(JSON.stringify({ __op: op, ...it }) + "\n");
        saved++;
      }
    }

    w.end();
    summary[op] = { totalCount, pages: pagesOk, saved, issues: issuesAcc };
    console.log(`[op done] ${op} | totalCount=${totalCount} | saved=${saved} | pages=${pagesOk}`);
  });
  await Promise.all(opTasks);

  const out = path.join(CACHE_DIR, `${ym}-bid-summary.json`);
  const totalSaved = Object.values(summary).reduce((s, x) => s + (x?.saved ?? 0), 0);
  const totalAPI = Object.values(summary).reduce((s, x) => s + (x?.totalCount ?? 0), 0);
  fs.writeFileSync(out, JSON.stringify({
    ym, generatedAt: new Date().toISOString(),
    summary, totalSaved, totalAPI, abortReason,
    quotaUsedToday: readQuota(),
  }, null, 2));

  console.log(`\n=== bid 모집 완료 (ym=${ym}) ===`);
  console.log(`  G2B totalCount 합: ${totalAPI}`);
  console.log(`  JSONL 적재: ${totalSaved}`);
  console.log(`  abort: ${abortReason || "(none)"}`);
  console.log(`  → 다음 단계: ts-node src/scripts/audit-bid.ts --ym ${ym}`);
  if (abortReason) process.exit(2);
})().catch((e) => { console.error(e); process.exit(1); });
