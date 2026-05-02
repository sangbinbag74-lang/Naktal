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
(async () => {
  const pool = new Pool({ connectionString: loadDb(), max: 1 });
  const c = await pool.connect();
  // reparse 외 audit/verify 큰 SELECT 종료
  const r = await c.query(`
    SELECT pid, LEFT(query, 80) AS q FROM pg_stat_activity
    WHERE datname = current_database() AND pid != pg_backend_pid()
      AND state = 'active'
      AND (query ILIKE '%information_schema.columns%' OR query ILIKE '%COUNT(*) FILTER%' OR query ILIKE '%TABLESAMPLE%')
      AND query NOT ILIKE '%UPDATE "BidResult"%'
  `);
  console.log(`종료 대상: ${r.rowCount}건`);
  for (const x of r.rows) {
    await c.query(`SELECT pg_terminate_backend($1)`, [x.pid]);
    console.log(`  PID ${x.pid} 종료: ${x.q}`);
  }
  c.release(); await pool.end();
})();
