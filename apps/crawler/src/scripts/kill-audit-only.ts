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
  const r = await c.query(`
    SELECT pid FROM pg_stat_activity
    WHERE datname = current_database() AND pid != pg_backend_pid()
      AND state = 'active'
      AND query ILIKE '%COUNT(*) FILTER (WHERE ("id" IS NULL%'
  `);
  for (const x of r.rows) {
    await c.query(`SELECT pg_terminate_backend($1)`, [x.pid]);
    console.log(`PID ${x.pid} 종료`);
  }
  console.log(`종료: ${r.rowCount}건`);
  c.release(); await pool.end();
})();
