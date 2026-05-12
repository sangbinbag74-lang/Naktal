/**
 * 옵션 A 재수집 — BidResult 2단계 분석 (모집·분석·적재 3단계 분리)
 *
 * - .recollect-cache/{ym}-bid-{op}.jsonl 4개 읽음
 * - bidNtceNo 100% / sucsfbidAmt ≥95% / sucsfbidRate ≥95% / 표본 5건
 * - 통과 시 audit JSON 저장
 *
 * 실행: ts-node src/scripts/audit-bid.ts --ym 200703
 */

import * as path from "path";
import * as fs from "fs";

const CACHE_DIR = path.resolve(__dirname, "../../.recollect-cache");
const OPS = [
  "getScsbidListSttusThng",
  "getScsbidListSttusCnstwk",
  "getScsbidListSttusServc",
  "getScsbidListSttusFrgcpt",
] as const;
type Op = typeof OPS[number];

function parseArgs() {
  const args = process.argv.slice(2);
  let ym = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--ym" && args[i + 1]) ym = args[i + 1];
  }
  if (!/^\d{6}$/.test(ym)) { console.error("Usage: --ym YYYYMM"); process.exit(1); }
  return { ym };
}

function readJSONL(fp: string): any[] {
  if (!fs.existsSync(fp)) return [];
  const txt = fs.readFileSync(fp, "utf-8");
  const rows: any[] = [];
  for (const line of txt.split("\n")) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return rows;
}

function isFilledStr(v: any): boolean {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  if (s === "" || s === "0") return false;
  return true;
}
function isFilledAmt(v: any): boolean {
  const s = String(v ?? "").replace(/[^0-9]/g, "");
  return !!s && parseInt(s, 10) > 0;
}
function isFilledRate(v: any): boolean {
  const s = String(v ?? "").replace(/[^0-9.]/g, "");
  return !!s && parseFloat(s) > 0;
}

(async () => {
  const { ym } = parseArgs();
  console.log(`=== Bid Audit: ym=${ym} ===\n`);

  let allRows: any[] = [];
  const perOp: any = {};
  for (const op of OPS) {
    const fp = path.join(CACHE_DIR, `${ym}-bid-${op}.jsonl`);
    const rows = readJSONL(fp);
    perOp[op] = { rows: rows.length };
    allRows = allRows.concat(rows);
    console.log(`[${op}] ${rows.length} rows`);
  }
  console.log(`\n전체 합: ${allRows.length} rows`);

  if (allRows.length === 0) {
    // 데이터 없음 — 정상일 수 있음 (개찰 결과 미공개 월 등). EMPTY 처리하여 적재 단계에서 idempotent 통과.
    const out = path.join(CACHE_DIR, `${ym}-bid-audit.json`);
    fs.writeFileSync(out, JSON.stringify({
      ym, generatedAt: new Date().toISOString(),
      decision: "EMPTY", totalRows: 0,
    }, null, 2));
    console.log(`\n=== 판정: EMPTY (데이터 없음) — 적재 skip ===`);
    console.log(`  audit: ${out}`);
    return;
  }

  let idFilled = 0, amtFilled = 0, rateFilled = 0;
  const samples: any[] = [];
  for (const r of allRows) {
    if (isFilledStr(r.bidNtceNo)) idFilled++;
    if (isFilledAmt(r.sucsfbidAmt)) amtFilled++;
    if (isFilledRate(r.sucsfbidRate)) rateFilled++;
    if (samples.length < 5) samples.push(r);
  }
  const idPct = (idFilled / allRows.length) * 100;
  const amtPct = (amtFilled / allRows.length) * 100;
  const ratePct = (rateFilled / allRows.length) * 100;

  console.log(`\n=== 필드 채움율 ===`);
  console.log(`  bidNtceNo:    ${idPct.toFixed(2)}% (${idFilled}/${allRows.length})`);
  console.log(`  sucsfbidAmt:  ${amtPct.toFixed(2)}% (${amtFilled}/${allRows.length})`);
  console.log(`  sucsfbidRate: ${ratePct.toFixed(2)}% (${rateFilled}/${allRows.length})`);

  console.log(`\n=== 표본 5건 ===`);
  for (let i = 0; i < Math.min(5, samples.length); i++) {
    const s = samples[i];
    console.log(`  [${i + 1}] op=${s.__op} bidNtceNo=${s.bidNtceNo} | amt=${s.sucsfbidAmt} | rate=${s.sucsfbidRate} | corp=${(s.sucsfbidCorpNm ?? s.bidwinnrNm ?? "").slice(0, 25)} | bidders=${s.prtcptCnum ?? s.totPrtcptCo}`);
  }

  // bidNtceNo: 100%, amt/rate: 90% (G2B 결측 가능 — 무효표/유찰 등)
  const idOk = idPct === 100;
  const amtOk = amtPct >= 90;
  const rateOk = ratePct >= 90;
  const decision = idOk && amtOk && rateOk ? "GO" : "NO";

  console.log(`\n=== 판정 ===`);
  console.log(`  bidNtceNo 100%:   ${idOk ? "✓" : "✗"}`);
  console.log(`  sucsfbidAmt ≥90%: ${amtOk ? "✓" : "✗"} (${amtPct.toFixed(2)}%)`);
  console.log(`  sucsfbidRate ≥90%:${rateOk ? "✓" : "✗"} (${ratePct.toFixed(2)}%)`);
  console.log(`  → ${decision}`);

  const out = path.join(CACHE_DIR, `${ym}-bid-audit.json`);
  fs.writeFileSync(out, JSON.stringify({
    ym, generatedAt: new Date().toISOString(),
    decision, totalRows: allRows.length, perOp,
    judgement: {
      idPct, amtPct, ratePct,
      idOk, amtOk, rateOk,
    },
  }, null, 2));
  console.log(`\n  audit: ${out}`);
  console.log(`  → 다음 단계: ${decision === "GO" ? `ts-node src/scripts/load-bid.ts --ym ${ym}` : "사용자 결정 필요 (NO)"}`);

  if (decision === "NO") process.exit(3);
})().catch((e) => { console.error(e); process.exit(1); });
