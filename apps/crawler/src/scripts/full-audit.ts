import { Pool } from "pg";
import * as fs from "fs"; import * as path from "path";
function loadDb() {
  const env = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(env, "utf-8");
  for (const l of c.split("\n")) { const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i === -1) continue;
    const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "DATABASE_URL" && v) return v; } throw new Error();
}

// 검사 대상: 작은 테이블 먼저 → 큰 테이블 마지막 (락 경쟁 회피)
const TABLES = [
  "BidOutcome",
  "BidPricePrediction",
  "OrgBiddingPattern",
  "SajungRateStat",
  "NumberSelectionStat",
  "AnnouncementExtra",
  "PreStdrd",
  "AnnouncementChgHst",
  "BidOpeningDetail",
  "BidResult",
  "Announcement",
];

function isEmptyExpr(dataType: string, col: string): string {
  // 컬럼 데이터타입에 따라 "쓰레기 값" 정의
  const c = `"${col}"`;
  if (dataType === "text" || dataType === "character varying") return `(${c} IS NULL OR ${c} = '')`;
  if (dataType === "ARRAY") return `(${c} IS NULL OR cardinality(${c}) = 0)`;
  if (dataType === "jsonb" || dataType === "json") return `(${c} IS NULL OR ${c}::text = 'null' OR ${c}::text = '{}' OR ${c}::text = '[]')`;
  if (dataType.startsWith("timestamp") || dataType === "date") return `(${c} IS NULL)`;
  if (dataType === "boolean") return `(${c} IS NULL)`;
  if (dataType === "integer" || dataType === "bigint" || dataType === "smallint") return `(${c} IS NULL)`;
  if (dataType === "double precision" || dataType === "real" || dataType === "numeric") return `(${c} IS NULL)`;
  return `(${c} IS NULL)`;
}

(async () => {
  const pool = new Pool({ connectionString: loadDb(), max: 1, statement_timeout: 600000 });
  const c = await pool.connect();

  console.log("=".repeat(80));
  console.log("DB 전수조사 — NULL/쓰레기 값 비율 (추가 크롤링 없이 현재 상태 평가)");
  console.log("=".repeat(80));

  for (const table of TABLES) {
    // 1) 테이블 존재·총행수
    let totalRows: number;
    try {
      const r = await c.query(`SELECT COUNT(*)::bigint AS n FROM "${table}"`);
      totalRows = Number(r.rows[0].n);
    } catch (e: any) {
      console.log(`\n[${table}] ❌ 존재하지 않음 또는 오류: ${e.message}`);
      continue;
    }
    if (totalRows === 0) {
      console.log(`\n[${table}] (0 행 — 비어있음)`);
      continue;
    }

    // 2) 컬럼 목록 + 데이터타입
    const cols = await c.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = $1 AND table_schema = 'public'
      ORDER BY ordinal_position
    `, [table]);

    if (cols.rowCount === 0) {
      console.log(`\n[${table}] 컬럼 정보 없음`);
      continue;
    }

    console.log(`\n[${table}] 총 ${totalRows.toLocaleString()} 행, ${cols.rowCount} 컬럼`);
    console.log(`  ${"컬럼".padEnd(30)} ${"타입".padEnd(20)} ${"empty/null".padStart(15)} ${"%".padStart(7)}`);
    console.log(`  ${"-".repeat(30)} ${"-".repeat(20)} ${"-".repeat(15)} ${"-".repeat(7)}`);

    // 3) 각 컬럼 NULL/빈값 비율 — 한 번의 쿼리로 묶어서
    const exprs = cols.rows.map((cc, idx) => {
      const expr = isEmptyExpr(cc.data_type, cc.column_name);
      return `COUNT(*) FILTER (WHERE ${expr})::bigint AS c${idx}`;
    });
    let res;
    try {
      res = await c.query(`SELECT ${exprs.join(", ")} FROM "${table}"`);
    } catch (e: any) {
      console.log(`  ⚠️ 일괄 쿼리 실패, 컬럼별 개별 쿼리로 폴백: ${e.message}`);
      const counts: Record<string, number> = {};
      for (let i = 0; i < cols.rowCount!; i++) {
        const cc = cols.rows[i];
        try {
          const expr = isEmptyExpr(cc.data_type, cc.column_name);
          const r = await c.query(`SELECT COUNT(*) FILTER (WHERE ${expr})::bigint AS n FROM "${table}"`);
          counts[`c${i}`] = Number(r.rows[0].n);
        } catch (e2: any) {
          counts[`c${i}`] = -1;
        }
      }
      res = { rows: [counts] };
    }

    const row = res.rows[0];
    for (let i = 0; i < cols.rowCount!; i++) {
      const cc = cols.rows[i];
      const empty = Number(row[`c${i}`]);
      if (empty < 0) {
        console.log(`  ${cc.column_name.padEnd(30)} ${cc.data_type.padEnd(20)} ${"ERROR".padStart(15)} ${"-".padStart(7)}`);
        continue;
      }
      const pct = (empty / totalRows) * 100;
      const flag = pct >= 95 ? "🔴" : pct >= 50 ? "🟠" : pct >= 10 ? "🟡" : pct > 0 ? "  " : "✅";
      console.log(`  ${flag} ${cc.column_name.padEnd(28)} ${cc.data_type.padEnd(20)} ${empty.toLocaleString().padStart(15)} ${pct.toFixed(1).padStart(6)}%`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("범례: 🔴 ≥95% 비어있음(거의 쓰레기) / 🟠 ≥50% / 🟡 ≥10% / ✅ 100% 채움");
  console.log("=".repeat(80));

  c.release(); await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
