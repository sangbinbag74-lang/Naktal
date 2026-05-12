import { Pool } from "pg";
import * as fs from "fs"; import * as path from "path";
let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) { const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") dbUrl = v; }
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 8000 });
(async () => {
  const r = await pool.query(`
    SELECT pid, state, application_name, wait_event,
      EXTRACT(EPOCH FROM (NOW() - query_start))::int AS dur_s,
      LEFT(query, 200) AS q
    FROM pg_stat_activity
    WHERE state = 'active' AND query NOT LIKE '%pg_stat%'
    ORDER BY query_start ASC LIMIT 20
  `);
  for (const row of r.rows) {
    console.log(`pid=${row.pid} dur=${row.dur_s}s wait=${row.wait_event}`);
    console.log(`  ${row.q.replace(/\s+/g,' ').trim().slice(0,180)}`);
  }
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
