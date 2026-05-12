/**
 * 옵션 A 재수집 — 1단계 모집 (모집·분석·적재 3단계 분리)
 *
 * 기능:
 * - 단일 월(YYYYMM) × G2B 3 op (Cnstwk/Servc/Thng)
 * - inqryDiv=1 (공고일자 기준), numOfRows=999, 페이지네이션
 * - 응답을 JSONL 파일에 적재 (.recollect-cache/{ym}-{op}.jsonl)
 * - DB INSERT 0회
 * - 페이지마다 nullity check → 비정상 발견 시 stdout 즉시 보고
 * - 일일 호출 카운터 (.recollect-cache/quota-{YYYY-MM-DD}.json) 잔여<200 시 abort
 *
 * 실행: ts-node src/scripts/re-collect-month.ts --ym 200703
 */

import * as path from "path";
import * as fs from "fs";

// ─── env load (refill-incomplete-anns.ts 와 동일 패턴: web/.env.local 우선) ──
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

const BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";
const OPS = ["getBidPblancListInfoCnstwk", "getBidPblancListInfoServc", "getBidPblancListInfoThng"] as const;
type Op = typeof OPS[number];

const CACHE_DIR = path.resolve(__dirname, "../../.recollect-cache");
fs.mkdirSync(CACHE_DIR, { recursive: true });

const DAILY_LIMIT = parseInt(process.env.KONEPS_DAILY_LIMIT_REAL || "100000", 10);
const QUOTA_GUARD = 200;

// ─── CLI ────────────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  let ym = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--ym" && args[i + 1]) ym = args[i + 1];
  }
  if (!/^\d{6}$/.test(ym)) {
    console.error("Usage: --ym YYYYMM");
    process.exit(1);
  }
  return { ym };
}

function lastDay(ym: string): string {
  const y = parseInt(ym.slice(0, 4));
  const m = parseInt(ym.slice(4, 6));
  const d = new Date(y, m, 0).getDate();
  return `${ym}${String(d).padStart(2, "0")}`;
}

// ─── quota counter ──────────────────────────────────────────────────────────
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function quotaPath(): string {
  return path.join(CACHE_DIR, `quota-${todayKey()}.json`);
}
function readQuota(): number {
  try { return JSON.parse(fs.readFileSync(quotaPath(), "utf-8")).count ?? 0; } catch { return 0; }
}
function writeQuota(n: number) {
  fs.writeFileSync(quotaPath(), JSON.stringify({ date: todayKey(), count: n }));
}
function quotaRemaining(): number {
  return DAILY_LIMIT - readQuota();
}

// ─── nullity check ──────────────────────────────────────────────────────────
interface NullityIssue {
  type: "NULL_BIDNTCENO" | "EMPTY_NTCENM" | "NULL_BIDCLSEDT" | "INVALID_DATE_FORMAT" | "OTHER";
  count: number;
  sample?: any;
}

function checkPage(items: any[]): NullityIssue[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  const issues: NullityIssue[] = [];
  let nullId = 0, emptyNm = 0, nullClse = 0;
  let firstSampleNullId: any = null, firstSampleNullClse: any = null;

  for (const it of items) {
    if (!it.bidNtceNo || String(it.bidNtceNo).trim() === "") {
      nullId++;
      if (!firstSampleNullId) firstSampleNullId = it;
    }
    if (!it.bidNtceNm || String(it.bidNtceNm).trim() === "") emptyNm++;
    if (!it.bidClseDt || String(it.bidClseDt).trim() === "") {
      nullClse++;
      if (!firstSampleNullClse) firstSampleNullClse = it;
    }
  }

  if (nullId > 0) issues.push({ type: "NULL_BIDNTCENO", count: nullId, sample: firstSampleNullId });
  if (emptyNm > 0) issues.push({ type: "EMPTY_NTCENM", count: emptyNm });
  if (nullClse > 0) issues.push({ type: "NULL_BIDCLSEDT", count: nullClse, sample: firstSampleNullClse });
  return issues;
}

// ─── core fetch (직접 호출, 한 페이지) ─────────────────────────────────────────
async function fetchPage(op: Op, ym: string, pageNo: number, numOfRows: number): Promise<{
  ok: boolean;
  items: any[];
  totalCount: number;
  resultCode: string;
  resultMsg: string;
  raw: string;
}> {
  const from = `${ym.slice(0, 4)}${ym.slice(4, 6)}010000`;
  const to   = `${lastDay(ym)}2359`;
  const u = `${BASE}/${op}?serviceKey=${encodeURIComponent(KEY)}&inqryDiv=1&inqryBgnDt=${from}&inqryEndDt=${to}&numOfRows=${numOfRows}&pageNo=${pageNo}&type=json`;

  let raw = "";
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(60_000) });
    raw = await r.text();
    if (!r.ok) {
      return { ok: false, items: [], totalCount: 0, resultCode: `HTTP_${r.status}`, resultMsg: `HTTP ${r.status}`, raw };
    }
    let parsed: any;
    try { parsed = JSON.parse(raw); }
    catch { return { ok: false, items: [], totalCount: 0, resultCode: "JSON_PARSE", resultMsg: "JSON parse fail", raw: raw.slice(0, 500) }; }

    const code = parsed?.response?.header?.resultCode ?? parsed?.["nkoneps.com.response.ResponseError"]?.header?.resultCode ?? "??";
    const msg  = parsed?.response?.header?.resultMsg  ?? parsed?.["nkoneps.com.response.ResponseError"]?.header?.resultMsg  ?? "?";
    const body = parsed?.response?.body;
    const tc = body?.totalCount ?? 0;
    const rawItems = body?.items;
    let items: any[] = [];
    if (Array.isArray(rawItems)) items = rawItems;
    else if (rawItems && typeof rawItems === "object" && "item" in rawItems) {
      const x = rawItems.item;
      items = Array.isArray(x) ? x : (x ? [x] : []);
    }

    return { ok: code === "00", items, totalCount: tc, resultCode: code, resultMsg: msg, raw: raw.slice(0, 500) };
  } catch (e) {
    return { ok: false, items: [], totalCount: 0, resultCode: "FETCH_ERR", resultMsg: String(e).slice(0, 200), raw };
  }
}

// ─── main ───────────────────────────────────────────────────────────────────
(async () => {
  const { ym } = parseArgs();
  const NUM = 999;

  // 일일 한도 체크
  const remStart = quotaRemaining();
  console.log(`[start] ym=${ym} | 일일 한도 잔여=${remStart} / 한도=${DAILY_LIMIT}`);
  if (remStart < QUOTA_GUARD) {
    console.error(`잔여 호출 ${remStart} < ${QUOTA_GUARD} — abort. 자정 후 재시도`);
    process.exit(2);
  }

  const summary: Record<Op, { totalCount: number; pages: number; saved: number; issues: NullityIssue[] }> = {} as any;
  let abortReason = "";

  for (const op of OPS) {
    const fp = path.join(CACHE_DIR, `${ym}-${op}.jsonl`);
    if (fs.existsSync(fp)) fs.unlinkSync(fp); // idempotent restart
    const w = fs.createWriteStream(fp, { flags: "a" });

    let totalCount = 0;
    let saved = 0;
    let pages = 0;
    const issuesAcc: NullityIssue[] = [];

    for (let page = 1; page <= 999; page++) {
      // 한도 체크
      const rem = quotaRemaining();
      if (rem < QUOTA_GUARD) {
        abortReason = `quota_low (잔여 ${rem})`;
        console.error(`⛔ ${ym}-${op} page=${page} | quota 잔여 ${rem} < ${QUOTA_GUARD} — abort`);
        break;
      }

      const r = await fetchPage(op, ym, page, NUM);
      writeQuota(readQuota() + 1);

      if (!r.ok) {
        // resultCode 07 + page>1 → 정상 끝
        if (r.resultCode === "07" && page > 1) {
          console.log(`  [${op}] page=${page} resultCode=07 → 정상 페이지 끝`);
          break;
        }
        // 그 외 비정상
        console.error(`⚠️ ${ym}-${op} page=${page} | code=${r.resultCode} | msg=${r.resultMsg.slice(0, 100)}`);
        if (r.resultCode === "07") {
          abortReason = "code_07_page1 (한도/장애 의심)";
          break;
        }
        if (page === 1 && /HTTP_5\d{2}/.test(r.resultCode)) {
          abortReason = `HTTP 장애: ${r.resultCode}`;
          break;
        }
        // 그 외 단일 페이지 일시 오류 — skip 1회 재시도
        await new Promise(rs => setTimeout(rs, 2000));
        const r2 = await fetchPage(op, ym, page, NUM);
        writeQuota(readQuota() + 1);
        if (!r2.ok) {
          console.error(`⚠️ ${ym}-${op} page=${page} | 재시도 실패 code=${r2.resultCode}`);
          break;
        }
        Object.assign(r, r2);
      }

      pages++;
      if (page === 1) totalCount = r.totalCount;

      // nullity check (즉시 stdout 보고)
      const issues = checkPage(r.items);
      for (const iss of issues) {
        const sampleStr = iss.sample ? JSON.stringify(iss.sample).slice(0, 200) : "";
        console.error(`⚠️ ${ym}-${op} p=${page} | ${iss.type} count=${iss.count} | ${sampleStr}`);
        const accIdx = issuesAcc.findIndex((x) => x.type === iss.type);
        if (accIdx === -1) issuesAcc.push({ ...iss });
        else issuesAcc[accIdx].count += iss.count;
      }

      // JSONL append (op 정보 포함)
      for (const it of r.items) {
        w.write(JSON.stringify({ __op: op, ...it }) + "\n");
        saved++;
      }

      console.log(`  [${op}] p=${page} | items=${r.items.length} | totalCount=${totalCount} | 누적=${saved}`);

      if (page * NUM >= totalCount) break;
      if (r.items.length === 0) break;

      await new Promise(rs => setTimeout(rs, 250));
    }

    w.end();
    summary[op] = { totalCount, pages, saved, issues: issuesAcc };
    console.log(`[op done] ${op} | totalCount=${totalCount} | saved=${saved} | pages=${pages}`);

    if (abortReason) break;
  }

  // 최종 summary
  const out = path.join(CACHE_DIR, `${ym}-summary.json`);
  const totalSaved = Object.values(summary).reduce((s, x) => s + (x?.saved ?? 0), 0);
  const totalAPI   = Object.values(summary).reduce((s, x) => s + (x?.totalCount ?? 0), 0);
  fs.writeFileSync(out, JSON.stringify({
    ym, generatedAt: new Date().toISOString(),
    summary, totalSaved, totalAPI, abortReason,
    quotaUsedToday: readQuota(),
  }, null, 2));

  console.log(`\n=== 모집 완료 (ym=${ym}) ===`);
  console.log(`  G2B totalCount 합: ${totalAPI}`);
  console.log(`  JSONL 적재: ${totalSaved}`);
  console.log(`  abort: ${abortReason || "(none)"}`);
  console.log(`  summary: ${out}`);
  console.log(`  → 다음 단계: ts-node src/scripts/audit-recollect.ts --ym ${ym}`);
  if (abortReason) process.exit(2);
})().catch((e) => { console.error(e); process.exit(1); });
