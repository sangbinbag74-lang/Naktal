import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") dbUrl = v;
}
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 0 });

(async () => {
  const r = await pool.query(`
    SELECT pid, state, wait_event_type AS we,
           EXTRACT(EPOCH FROM (NOW() - query_start))::int AS dur_s,
           LEFT(query, 200) AS q
    FROM pg_stat_activity
    WHERE state = 'active' AND pid <> pg_backend_pid()
    ORDER BY query_start
    LIMIT 10
  `);
  for (const row of r.rows) {
    console.log(`pid=${row.pid} we=${row.we} dur=${row.dur_s}s`);
    console.log(`  ${row.q.replace(/\s+/g, ' ').slice(0, 200)}`);
  }
  const r2 = await pool.query(`SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE state <> 'idle'`);
  console.log(`총 active=${r2.rows[0].n}`);
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
