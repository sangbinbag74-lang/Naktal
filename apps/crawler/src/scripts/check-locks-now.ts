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
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 15000 });

(async () => {
  const r = await pool.query(`
    SELECT pid, state, wait_event_type, wait_event, 
           EXTRACT(EPOCH FROM (NOW() - query_start))::int AS dur_s,
           LEFT(query, 80) AS qhead
    FROM pg_stat_activity
    WHERE state IS NOT NULL AND state <> 'idle' AND query NOT LIKE '%pg_stat_activity%'
    ORDER BY query_start ASC NULLS LAST
  `);
  console.log("=== 활성 쿼리 (idle 제외) ===");
  for (const row of r.rows) {
    const m = Math.floor(row.dur_s / 60), s = row.dur_s % 60;
    console.log(`[${m}m${s}s] pid=${row.pid} ${row.state} wait=${row.wait_event_type}/${row.wait_event}`);
    console.log(`  ${row.qhead.replace(/\s+/g, ' ').trim()}`);
  }
  
  const lock = await pool.query(`
    SELECT COUNT(*) AS blocked FROM pg_locks WHERE NOT granted
  `);
  console.log(`\n=== 차단된 lock: ${lock.rows[0].blocked} ===`);
  
  const idle = await pool.query(`
    SELECT COUNT(*)::int AS c FROM pg_stat_activity 
    WHERE state = 'idle in transaction'
  `);
  console.log(`=== idle in transaction: ${idle.rows[0].c} (좀비 의심) ===`);
  
  await pool.end();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
