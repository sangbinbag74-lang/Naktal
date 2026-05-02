/**
 * 전 테이블 × 전 필드 감사 — 1% 샘플링으로 빠르게 근사치 채움율 확인
 * TABLESAMPLE BERNOULLI(1): 6.66M rows → 66K scan. 전체 스캔 대비 ~100배 빠름.
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadDbUrl(): string {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(rootEnv, "utf-8");
  for (const l of c.split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "DATABASE_URL" && v) return v;
  }
  return process.env.DATABASE_URL!;
}

const TABLES = [
  ["Announcement", 1],          // 1% 샘플
  ["BidResult", 1],
  ["BidOpeningDetail", 1],
  ["AnnouncementChgHst", 5],    // 487K → 5% 샘플 = 24K
  ["SajungRateStat", 100],      // 106K → 전체
  ["PreStdrd", 5],              // 1.6M → 5% = 80K
  ["BidOutcome", 100],
  ["BidPricePrediction", 100],
  ["CompetitorProfile", 100],
  ["NumberSelectionStat", 100],
  ["NumberRecommendation", 100],
  ["CompanyProfile", 100],
] as const;

function fillCondition(dataType: string, udt: string): string {
  const t = (dataType || "").toLowerCase();
  const u = (udt || "").toLowerCase();
  if (t === "array" || u === "_int4" || u === "_text") return `array_length("<F>", 1) > 0`;
  if (t === "jsonb" || t === "json") return `"<F>" IS NOT NULL AND "<F>"::text NOT IN ('null', '{}', '[]', '""')`;
  if (["integer","bigint","numeric","double precision","real","smallint"].includes(t)) return `"<F>" IS NOT NULL AND "<F>" != 0`;
  if (["text","character varying","character"].includes(t)) return `"<F>" IS NOT NULL AND "<F>" != ''`;
  return `"<F>" IS NOT NULL`;
}

(async () => {
  const pool = new Pool({ connectionString: loadDbUrl(), statement_timeout: 180000 });
  process.stdout.write(`=== 샘플링 감사 (1~5%) — ${new Date().toISOString()} ===\n\n`);

  for (const [table, pct] of TABLES) {
    process.stdout.write(`\n━━━ ${table} (샘플 ${pct}%) ━━━\n`);
    const exists = await pool.query(
      `SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name=$1) AS e`, [table]);
    if (!exists.rows[0].e) { process.stdout.write(`  (스킵 — 없음)\n`); continue; }

    const cols = await pool.query(
      `SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`, [table]);

    // 전체 rowcount 추정 (pg_class.reltuples)
    const est = await pool.query(`SELECT reltuples::bigint AS n FROM pg_class WHERE relname=$1`, [table]);
    const estRows = Number(est.rows[0]?.n ?? 0);
    process.stdout.write(`  추정 rows: ${estRows.toLocaleString()}\n`);
    if (estRows === 0) continue;

    const sampleClause = pct < 100 ? `TABLESAMPLE BERNOULLI (${pct})` : "";

    // 샘플 크기 먼저 확인
    const sizeRes = await pool.query(`SELECT COUNT(*)::bigint AS n FROM "${table}" ${sampleClause}`).catch(() => null);
    const sampleN = Number(sizeRes?.rows[0]?.n ?? 0);
    process.stdout.write(`  샘플 크기: ${sampleN.toLocaleString()}\n`);
    if (sampleN === 0) continue;

    for (const col of cols.rows) {
      const fname = col.column_name;
      if (["id", "createdAt", "updatedAt"].includes(fname)) continue;
      const cond = fillCondition(col.data_type, col.udt_name).split("<F>").join(fname);
      try {
        const r = await pool.query(`SELECT COUNT(*) FILTER (WHERE ${cond})::bigint AS filled FROM "${table}" ${sampleClause}`);
        const filled = Number(r.rows[0].filled);
        const p = sampleN > 0 ? (filled / sampleN) * 100 : 0;
        const status = p < 1 ? "🔴" : p < 50 ? "🟠" : p < 90 ? "🟡" : "🟢";
        process.stdout.write(`  ${status} ${p.toFixed(1).padStart(5)}%  ${fname.padEnd(32)}  (${filled.toLocaleString()}/${sampleN.toLocaleString()})\n`);

        if (p < 50 && filled > 0) {
          const s = await pool.query(`SELECT "${fname}" FROM "${table}" ${sampleClause} WHERE ${cond} LIMIT 1`);
          const val = s.rows[0]?.[fname];
          process.stdout.write(`         샘플: ${JSON.stringify(val).slice(0, 150)}\n`);
        }
      } catch (e) {
        process.stdout.write(`  ✗ ${fname}: ${(e as Error).message.slice(0, 80)}\n`);
      }
    }
  }

  process.stdout.write(`\n=== 감사 완료 ${new Date().toISOString()} ===\n`);
  await pool.end();
})();
