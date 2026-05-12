/**
 * 옵션 A 재수집 — BidResult 3단계 적재 (모집·분석·적재 3단계 분리)
 *
 * - .recollect-cache/{ym}-bid-audit.json decision === GO/EMPTY 강제
 * - 4 op JSONL 읽고 mapToRow 변환 → upsertBidResultBatch (idempotent UPSERT)
 * - 적재 후 표본 5건 SELECT → bidRate, finalPrice, winnerName 출력
 *
 * 실행: ts-node src/scripts/load-bid.ts --ym 200703
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

import Decimal from "decimal.js";
import { Pool } from "pg";
import { upsertBidResultBatch } from "../db/upsert";
import type { BidResultRow } from "../parsers/bid-result";

const CACHE_DIR = path.resolve(__dirname, "../../.recollect-cache");
const OPS = [
  "getScsbidListSttusThng",
  "getScsbidListSttusCnstwk",
  "getScsbidListSttusServc",
  "getScsbidListSttusFrgcpt",
] as const;

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

function parseOpengDt(raw: string | undefined | null): string | null {
  if (!raw || raw.length < 8) return null;
  if (raw.includes("-")) {
    const dt = new Date(raw.replace(" ", "T") + (raw.length <= 16 ? ":00+09:00" : "+09:00"));
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  const y = raw.slice(0, 4), mo = raw.slice(4, 6), d = raw.slice(6, 8);
  const hh = raw.slice(8, 10) || "00", mm = raw.slice(10, 12) || "00";
  const dt = new Date(`${y}-${mo}-${d}T${hh}:${mm}:00+09:00`);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

function mapItem(item: any): BidResultRow | null {
  try {
    const annId = item.bidNtceNo?.trim();
    if (!annId) return null;
    const bidRateRaw = String(item.sucsfbidRate ?? "").replace(/[^0-9.]/g, "");
    const finalPriceRaw = String(item.sucsfbidAmt ?? "").replace(/[^0-9]/g, "");
    const numBiddersRaw = String(item.prtcptCnum ?? item.totPrtcptCo ?? "0").replace(/[^0-9]/g, "");
    if (!bidRateRaw || !finalPriceRaw) return null;
    const bidRate = new Decimal(bidRateRaw).toFixed(4);
    const finalPrice = BigInt(parseInt(finalPriceRaw, 10));
    if (finalPrice <= 0n) return null;
    const numBidders = parseInt(numBiddersRaw, 10) || 0;
    const winnerName = String(item.sucsfbidCorpNm || item.bidwinnrNm || "").trim() || undefined;
    const openedAt = parseOpengDt(item.rlOpengDt || item.opengDt);
    return { annId, bidRate, finalPrice, numBidders, winnerName, openedAt };
  } catch {
    return null;
  }
}

(async () => {
  const { ym } = parseArgs();

  const auditFp = path.join(CACHE_DIR, `${ym}-bid-audit.json`);
  if (!fs.existsSync(auditFp)) {
    console.error(`bid-audit JSON 없음: ${auditFp}`);
    console.error(`먼저 ts-node src/scripts/audit-bid.ts --ym ${ym} 실행`);
    process.exit(1);
  }
  const audit = JSON.parse(fs.readFileSync(auditFp, "utf-8"));
  if (audit.decision !== "GO" && audit.decision !== "EMPTY") {
    console.error(`bid-audit decision=${audit.decision} (GO/EMPTY 아님) — 적재 거부`);
    process.exit(3);
  }
  console.log(`[load-bid] ym=${ym} | audit decision=${audit.decision}`);
  if (audit.decision === "EMPTY") {
    console.log(`  데이터 없음 — 적재 skip`);
    return;
  }

  const allRows: BidResultRow[] = [];
  let parsedFail = 0;
  for (const op of OPS) {
    const fp = path.join(CACHE_DIR, `${ym}-bid-${op}.jsonl`);
    const items = readJSONL(fp);
    let opOk = 0, opFail = 0;
    for (const it of items) {
      const { __op, ...item } = it;
      const row = mapItem(item);
      if (row) { allRows.push(row); opOk++; }
      else { opFail++; }
    }
    parsedFail += opFail;
    console.log(`  [${op}] JSONL=${items.length} | 변환 OK=${opOk} | 실패=${opFail}`);
  }
  console.log(`\n  변환 합계: 성공 ${allRows.length} | 실패 ${parsedFail}`);

  if (allRows.length === 0) {
    console.error(`변환 결과 0건 — 적재 중단`);
    return;
  }

  const sampleIds = allRows.slice(0, 5).map((r) => r.annId);

  console.log(`\n=== 적재 시작 (${allRows.length}건) ===`);
  const t0 = Date.now();
  const saved = await upsertBidResultBatch(allRows);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  적재 완료: ${saved}건 / ${elapsed}s`);

  const dbUrl = process.env.DATABASE_URL!;
  if (dbUrl) {
    const pool = new Pool({ connectionString: dbUrl, max: 1 });
    try {
      const r = await pool.query(`
        SELECT "annId", "bidRate"::text AS rate, "finalPrice"::text AS price, "numBidders", "winnerName", "openedAt"
        FROM "BidResult"
        WHERE "annId" = ANY($1::text[])
        ORDER BY "annId"
      `, [sampleIds]);
      console.log(`\n=== 적재 후 표본 SELECT (${r.rows.length}건) ===`);
      for (const row of r.rows) {
        console.log(`  ${row.annId} | rate=${row.rate} | price=${row.price} | bidders=${row.numBidders} | winner=${String(row.winnerName ?? "").slice(0, 25)} | opened=${row.openedAt?.toISOString?.() ?? row.openedAt}`);
      }
    } finally {
      await pool.end();
    }
  }

  console.log(`\n=== bid 적재 완료 (ym=${ym}) ===`);
})().catch((e) => { console.error(e); process.exit(1); });
