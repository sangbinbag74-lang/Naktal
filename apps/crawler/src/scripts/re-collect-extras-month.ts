/**
 * 옵션 A 재수집 — 보조 9 API 1단계 모집 (모집·분석·적재 3단계 분리)
 *
 * 단일 월 × 9 보조 API + 4 PreStdrd = 13 ops, inqryDiv=1 bulk, JSONL 적재.
 * - DB INSERT 0회
 * - 페이지마다 nullity check (op별 식별자/타겟 필드) → stdout 즉시 보고
 * - 일일 호출 카운터 공유 (.recollect-cache/quota-{YYYY-MM-DD}.json)
 *
 * 실행: ts-node src/scripts/re-collect-extras-month.ts --ym 200703
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

const BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";
const BASE_HRCSP = "https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService";

type ExtraOpDef = {
  op: string;
  base: string;
  // identifier (필수 100%) / 타겟 필드 (한 개라도 채워져야 의미 있음)
  idField: string;
  targetFields: string[];
  // 외자 등 별도 식별자 사용 op 체크
  altRequired?: string[];
};

const OPS: ExtraOpDef[] = [
  { op: "getBidPblancListInfoLicenseLimit",        base: BASE, idField: "bidNtceNo", targetFields: ["indstrytyMfrcFldList", "permsnIndstrytyList", "lcnsLmtNm"] },
  { op: "getBidPblancListInfoCnstwkBsisAmount",    base: BASE, idField: "bidNtceNo", targetFields: ["bssamt"] },
  { op: "getBidPblancListInfoServcBsisAmount",     base: BASE, idField: "bidNtceNo", targetFields: ["bssamt"] },
  { op: "getBidPblancListInfoThngBsisAmount",      base: BASE, idField: "bidNtceNo", targetFields: ["bssamt"] },
  { op: "getBidPblancListBidPrceCalclAInfo",       base: BASE, idField: "bidNtceNo", targetFields: ["sftyMngcst", "sftyChckMngcst", "rtrfundNon", "mrfnHealthInsrprm", "npnInsrprm", "odsnLngtrmrcprInsrprm", "qltyMngcst"] },
  { op: "getBidPblancListInfoChgHstryCnstwk",      base: BASE, idField: "bidNtceNo", targetFields: ["chgItemNm"] },
  { op: "getBidPblancListInfoChgHstryServc",       base: BASE, idField: "bidNtceNo", targetFields: ["chgItemNm"] },
  { op: "getBidPblancListInfoChgHstryThng",        base: BASE, idField: "bidNtceNo", targetFields: ["chgItemNm"] },
  { op: "getBidPblancListInfoFrgcpt",              base: BASE, idField: "bidNtceNo", targetFields: ["bidNtceNm", "bidClseDt"] },
  // PreStdrd: bfSpecRgstNo 식별자, 별도 처리
  { op: "getPublicPrcureThngInfoCnstwk",           base: BASE_HRCSP, idField: "bfSpecRgstNo", targetFields: ["bfSpecRgstNm", "rcptDt"] },
  { op: "getPublicPrcureThngInfoServc",            base: BASE_HRCSP, idField: "bfSpecRgstNo", targetFields: ["bfSpecRgstNm", "rcptDt"] },
  { op: "getPublicPrcureThngInfoThng",             base: BASE_HRCSP, idField: "bfSpecRgstNo", targetFields: ["bfSpecRgstNm", "rcptDt"] },
  { op: "getPublicPrcureThngInfoFrgcpt",           base: BASE_HRCSP, idField: "bfSpecRgstNo", targetFields: ["bfSpecRgstNm", "rcptDt"] },
];

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

interface NullityIssue {
  type: string; // NULL_IDFIELD or EMPTY_TARGET
  count: number;
  sample?: any;
}

function checkPage(items: any[], def: ExtraOpDef): NullityIssue[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  let nullId = 0;
  let allTargetEmpty = 0;
  let firstSampleId: any = null, firstSampleEmpty: any = null;
  for (const it of items) {
    if (!it[def.idField] || String(it[def.idField]).trim() === "") {
      nullId++;
      if (!firstSampleId) firstSampleId = it;
    }
    const filled = def.targetFields.some((f) => {
      const v = it[f];
      return v !== null && v !== undefined && String(v).trim() !== "" && String(v).trim() !== "0";
    });
    if (!filled) {
      allTargetEmpty++;
      if (!firstSampleEmpty) firstSampleEmpty = it;
    }
  }
  const issues: NullityIssue[] = [];
  if (nullId > 0) issues.push({ type: `NULL_${def.idField.toUpperCase()}`, count: nullId, sample: firstSampleId });
  if (allTargetEmpty > 0) issues.push({ type: `ALL_TARGETS_EMPTY(${def.targetFields.join(",")})`, count: allTargetEmpty, sample: firstSampleEmpty });
  return issues;
}

async function fetchPage(op: string, base: string, ym: string, pageNo: number, numOfRows: number) {
  const from = `${ym.slice(0, 4)}${ym.slice(4, 6)}010000`;
  const to = `${lastDay(ym)}2359`;
  const u = `${base}/${op}?serviceKey=${encodeURIComponent(KEY)}&inqryDiv=1&inqryBgnDt=${from}&inqryEndDt=${to}&numOfRows=${numOfRows}&pageNo=${pageNo}&type=json`;
  let raw = "";
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(60_000) });
    raw = await r.text();
    if (!r.ok) return { ok: false, items: [], totalCount: 0, resultCode: `HTTP_${r.status}`, resultMsg: `HTTP ${r.status}` };
    let parsed: any;
    try { parsed = JSON.parse(raw); }
    catch { return { ok: false, items: [], totalCount: 0, resultCode: "JSON_PARSE", resultMsg: "JSON parse fail" }; }
    const code = parsed?.response?.header?.resultCode ?? "??";
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
  const NUM = 999;

  const remStart = quotaRemaining();
  console.log(`[start] extras ym=${ym} | 일일 한도 잔여=${remStart} / 한도=${DAILY_LIMIT}`);
  if (remStart < QUOTA_GUARD) {
    console.error(`잔여 호출 ${remStart} < ${QUOTA_GUARD} — abort. 자정 후 재시도`);
    process.exit(2);
  }

  const summary: Record<string, { totalCount: number; pages: number; saved: number; issues: NullityIssue[] }> = {};
  let abortReason = "";

  // 13 op 병렬 + op 안의 모든 페이지 병렬 (G2B rate limit 무제한, 2026-05-06)
  const opTasks = OPS.map(async (def) => {
    const fp = path.join(CACHE_DIR, `${ym}-extras-${def.op}.jsonl`);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    const w = fs.createWriteStream(fp, { flags: "a" });

    const issuesAcc: NullityIssue[] = [];

    // 1차 페이지 (totalCount 알아내기)
    const r1 = await fetchPage(def.op, def.base, ym, 1, NUM);
    writeQuota(readQuota() + 1);

    if (!r1.ok) {
      if (r1.resultCode === "07") {
        console.log(`  [${def.op}] empty (resultCode=07)`);
      } else if (/HTTP_5\d{2}/.test(r1.resultCode)) {
        console.error(`⚠️ ${ym}-${def.op} page=1 | HTTP 장애: ${r1.resultCode}`);
        abortReason = `HTTP 장애: ${r1.resultCode}`;
      } else {
        console.error(`⚠️ ${ym}-${def.op} page=1 | code=${r1.resultCode} | msg=${r1.resultMsg.slice(0, 100)}`);
      }
      w.end();
      summary[def.op] = { totalCount: 0, pages: 0, saved: 0, issues: issuesAcc };
      return;
    }

    const totalCount = r1.totalCount;
    const totalPages = totalCount > 0 ? Math.ceil(totalCount / NUM) : 1;

    // 나머지 페이지 batch=10씩 병렬 + 실패 시 재시도 1회 (G2B 서버 동시호출 한계 회피)
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
          let r = await fetchPage(def.op, def.base, ym, p, NUM);
          totalCalls++;
          if (!r.ok && r.resultCode !== "07") {
            await new Promise(rs => setTimeout(rs, 1000));
            const r2 = await fetchPage(def.op, def.base, ym, p, NUM);
            totalCalls++;
            if (r2.ok) r = r2;
          }
          return { page: p, items: r.items, ok: r.ok, resultCode: r.resultCode };
        }),
      );
      for (const r of batchResults) allResults.push(r);
    }
    writeQuota(readQuota() + totalCalls);
    if (totalPages > 1) console.log(`  [${def.op}] page batch: ${totalPages} pages, ${totalCalls} calls | totalCount=${totalCount}`);

    let saved = 0;
    let pagesOk = 0;
    for (const r of allResults) {
      if (!r.ok) continue;
      pagesOk++;
      const issues = checkPage(r.items, def);
      for (const iss of issues) {
        const sampleStr = iss.sample ? JSON.stringify(iss.sample).slice(0, 200) : "";
        console.error(`⚠️ ${ym}-${def.op} p=${r.page} | ${iss.type} count=${iss.count} | ${sampleStr}`);
        const accIdx = issuesAcc.findIndex((x) => x.type === iss.type);
        if (accIdx === -1) issuesAcc.push({ ...iss });
        else issuesAcc[accIdx].count += iss.count;
      }
      for (const it of r.items) {
        w.write(JSON.stringify({ __op: def.op, ...it }) + "\n");
        saved++;
      }
    }

    w.end();
    summary[def.op] = { totalCount, pages: pagesOk, saved, issues: issuesAcc };
    console.log(`[op done] ${def.op} | totalCount=${totalCount} | saved=${saved} | pages=${pagesOk}`);
  });
  await Promise.all(opTasks);

  const out = path.join(CACHE_DIR, `${ym}-extras-summary.json`);
  const totalSaved = Object.values(summary).reduce((s, x) => s + (x?.saved ?? 0), 0);
  const totalAPI = Object.values(summary).reduce((s, x) => s + (x?.totalCount ?? 0), 0);
  fs.writeFileSync(out, JSON.stringify({
    ym, generatedAt: new Date().toISOString(),
    summary, totalSaved, totalAPI, abortReason,
    quotaUsedToday: readQuota(),
  }, null, 2));

  console.log(`\n=== extras 모집 완료 (ym=${ym}) ===`);
  console.log(`  G2B totalCount 합: ${totalAPI}`);
  console.log(`  JSONL 적재: ${totalSaved}`);
  console.log(`  abort: ${abortReason || "(none)"}`);
  console.log(`  → 다음 단계: ts-node src/scripts/audit-extras.ts --ym ${ym}`);
  if (abortReason) process.exit(2);
})().catch((e) => { console.error(e); process.exit(1); });
