/**
 * 옵션 A 재수집 — 3단계 적재 (모집·분석·적재 3단계 분리)
 *
 * 기능:
 * - .recollect-cache/{ym}-audit.json 읽음 → decision === "GO" 강제
 * - 3 JSONL 읽고 mapToRow 변환 → upsertAnnouncementBatch (idempotent UPSERT)
 * - 적재 후 표본 5건 SELECT → stdout 출력 (값 검증)
 * - CrawlLog HIST_CURSOR 기록 (job=recollect-month, lastYm=ym)
 *
 * 실행: ts-node src/scripts/load-recollect.ts --ym 200703
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

import { mapToRow } from "../fetchers/g2b-announcement";
import { upsertAnnouncementBatch, saveBulkCursor } from "../db/upsert";
import type { AnnouncementRow } from "../parsers/announcement";
import { Pool } from "pg";

const CACHE_DIR = path.resolve(__dirname, "../../.recollect-cache");
const OPS = ["getBidPblancListInfoCnstwk", "getBidPblancListInfoServc", "getBidPblancListInfoThng"] as const;

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
    try { rows.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return rows;
}

(async () => {
  const { ym } = parseArgs();

  // 1. audit 결과 강제 검증
  const auditFp = path.join(CACHE_DIR, `${ym}-audit.json`);
  if (!fs.existsSync(auditFp)) {
    console.error(`audit JSON 없음: ${auditFp}`);
    console.error(`먼저 ts-node src/scripts/audit-recollect.ts --ym ${ym} 실행`);
    process.exit(1);
  }
  const audit = JSON.parse(fs.readFileSync(auditFp, "utf-8"));
  if (audit.decision !== "GO") {
    console.error(`audit decision=${audit.decision} (GO 아님) — 적재 거부`);
    console.error(`사용자 결정 필요: 검증 기준 미달`);
    process.exit(3);
  }
  console.log(`[load] ym=${ym} | audit decision=GO | totalRows=${audit.totalRows}`);

  // 2. JSONL → AnnouncementRow 변환
  const allRows: AnnouncementRow[] = [];
  let parsedFail = 0;
  for (const op of OPS) {
    const fp = path.join(CACHE_DIR, `${ym}-${op}.jsonl`);
    const items = readJSONL(fp);
    let opOk = 0, opFail = 0;
    for (const it of items) {
      const { __op, ...item } = it;
      const row = mapToRow(item, op);
      if (row) { allRows.push(row); opOk++; }
      else { opFail++; }
    }
    parsedFail += opFail;
    console.log(`  [${op}] JSONL=${items.length} | 변환 OK=${opOk} | 실패=${opFail}`);
  }
  console.log(`\n  변환 합계: 성공 ${allRows.length} | 실패 ${parsedFail}`);

  if (allRows.length === 0) {
    console.error(`변환 결과 0건 — 적재 중단`);
    process.exit(2);
  }

  // 3. konepsId 표본 (적재 후 SELECT 검증용)
  const sampleIds = allRows.slice(0, 5).map((r) => r.konepsId);

  // 4. UPSERT
  console.log(`\n=== 적재 시작 (${allRows.length}건) ===`);
  const t0 = Date.now();
  const saved = await upsertAnnouncementBatch(allRows);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  적재 완료: ${saved}건 / ${elapsed}s`);

  // 5. 적재 후 표본 SELECT (값 검증)
  const dbUrl = process.env.DATABASE_URL!;
  const pool = new Pool({ connectionString: dbUrl, max: 1 });
  try {
    const r = await pool.query(`
      SELECT "konepsId", title, "orgName", budget::text AS budget, deadline,
             category, region, "sucsfbidLwltRate"
      FROM "Announcement"
      WHERE "konepsId" = ANY($1::text[])
      ORDER BY "konepsId"
    `, [sampleIds]);
    console.log(`\n=== 적재 후 표본 SELECT (${r.rows.length}건) ===`);
    for (const row of r.rows) {
      console.log(`  ${row.konepsId} | ${String(row.title).slice(0, 30)} | ${String(row.orgName).slice(0, 20)} | bdgt=${row.budget} | clse=${row.deadline?.toISOString?.() ?? row.deadline} | cat=${row.category} | rgn=${row.region}`);
    }

    // 같은 월 deadline 카운트 (실측 매칭률 산출)
    const ymStart = `${ym.slice(0, 4)}-${ym.slice(4, 6)}-01`;
    const nextMo = (() => {
      const y = parseInt(ym.slice(0, 4));
      const m = parseInt(ym.slice(4, 6));
      const ny = m === 12 ? y + 1 : y;
      const nm = m === 12 ? 1 : m + 1;
      return `${ny}-${String(nm).padStart(2, "0")}-01`;
    })();
    const cntRes = await pool.query(`
      SELECT COUNT(*)::int AS c FROM "Announcement"
      WHERE "deadline" >= $1::timestamptz AND "deadline" < $2::timestamptz
    `, [ymStart, nextMo]);
    console.log(`\n=== 적재 후 ${ym} deadline 같은 월 DB 카운트: ${cntRes.rows[0].c} ===`);
  } finally {
    await pool.end();
  }

  // 6. CrawlLog HIST_CURSOR 기록
  await saveBulkCursor({
    job: "recollect-month",
    lastYm: ym,
    reason: "DONE",
  });
  console.log(`\n  CrawlLog HIST_CURSOR 기록 완료 (job=recollect-month, lastYm=${ym})`);
  console.log(`\n=== 적재 완료 (ym=${ym}) ===`);
})().catch((e) => { console.error(e); process.exit(1); });
