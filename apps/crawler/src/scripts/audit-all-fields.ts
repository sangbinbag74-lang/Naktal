/**
 * 전 테이블 × 전 필드 전수 감사
 * 각 컬럼의 채움율 + 샘플값 전수 확인.
 * COUNT 로 "완료" 판단 절대 금지 원칙 강제 적용.
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

// 감사 대상 테이블 전체
const TABLES = [
  "Announcement",
  "BidResult",
  "BidOpeningDetail",
  "AnnouncementChgHst",
  "SajungRateStat",
  "PreStdrd",
  "NumberRecommendation",
  "CompanyProfile",
  "BidOutcome",
  "BidPricePrediction",
  "CompetitorProfile",
  "NumberSelectionStat",
];

// 필드 타입별 채움 조건
function fillCondition(dataType: string, udt: string): string {
  const t = (dataType || "").toLowerCase();
  const u = (udt || "").toLowerCase();
  if (t === "array" || u === "_int4" || u === "_text") {
    return `array_length("<F>", 1) > 0`;
  }
  if (t === "jsonb" || t === "json") {
    // json: 비어있지 않은지 (빈 object, 빈 배열, null 제외)
    return `"<F>" IS NOT NULL AND "<F>"::text NOT IN ('null', '{}', '[]', '""')`;
  }
  if (t === "integer" || t === "bigint" || t === "numeric" || t === "double precision" || t === "real" || t === "smallint") {
    return `"<F>" IS NOT NULL AND "<F>" != 0`;
  }
  if (t === "text" || t === "character varying" || t === "character") {
    return `"<F>" IS NOT NULL AND "<F>" != ''`;
  }
  if (t === "boolean") {
    return `"<F>" IS NOT NULL`;
  }
  if (t === "timestamp with time zone" || t === "timestamp without time zone" || t === "date") {
    return `"<F>" IS NOT NULL`;
  }
  return `"<F>" IS NOT NULL`;
}

(async () => {
  const pool = new Pool({ connectionString: loadDbUrl(), statement_timeout: 120000 });

  process.stdout.write(`=== 전 테이블 × 전 필드 전수 감사 (${new Date().toISOString()}) ===\n\n`);

  for (const table of TABLES) {
    // 테이블 존재 확인
    const exists = await pool.query(
      `SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name=$1) AS e`,
      [table],
    );
    if (!exists.rows[0].e) {
      process.stdout.write(`\n━━━ ${table} (스킵 — 테이블 없음) ━━━\n`);
      continue;
    }

    // 컬럼 목록
    const cols = await pool.query(
      `SELECT column_name, data_type, udt_name
       FROM information_schema.columns
       WHERE table_name=$1 ORDER BY ordinal_position`,
      [table],
    );

    // 전체 row 수
    const totRes = await pool.query(
      `SELECT reltuples::bigint AS est, (SELECT COUNT(*) FROM "${table}")::bigint AS total FROM pg_class WHERE relname=$1`,
      [table],
    ).catch(() => null);
    const total = totRes?.rows[0]?.total ?? 0;

    process.stdout.write(`\n━━━ ${table} (${Number(total).toLocaleString()} rows) ━━━\n`);

    if (total === 0) {
      process.stdout.write(`  (비어있음, 컬럼: ${cols.rows.map((r) => r.column_name).join(", ")})\n`);
      continue;
    }

    for (const col of cols.rows) {
      const fname = col.column_name;
      if (["id", "createdAt", "updatedAt"].includes(fname)) continue;
      const cond = fillCondition(col.data_type, col.udt_name).split("<F>").join(fname);
      try {
        const r = await pool.query(
          `SELECT COUNT(*) FILTER (WHERE ${cond})::bigint AS filled FROM "${table}"`,
        );
        const filled = Number(r.rows[0].filled);
        const pct = total > 0 ? (filled / Number(total)) * 100 : 0;
        let status = "🟢";
        if (pct < 1) status = "🔴";
        else if (pct < 50) status = "🟠";
        else if (pct < 90) status = "🟡";
        process.stdout.write(`  ${status} ${pct.toFixed(1).padStart(5)}%  ${fname.padEnd(30)}  (${filled.toLocaleString()} / ${Number(total).toLocaleString()})\n`);

        // 🔴 또는 🟠 인 경우 샘플 1건 확인
        if (pct < 50 && filled > 0) {
          const s = await pool.query(`SELECT "${fname}" FROM "${table}" WHERE ${cond} LIMIT 1`);
          const val = s.rows[0]?.[fname];
          process.stdout.write(`         샘플: ${JSON.stringify(val).slice(0, 150)}\n`);
        }
      } catch (e) {
        process.stdout.write(`  ✗ ${fname}: ${(e as Error).message.slice(0, 80)}\n`);
      }
    }
  }

  process.stdout.write(`\n=== 감사 완료 (${new Date().toISOString()}) ===\n`);
  await pool.end();
})();
