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
  console.log("=== 활성 쿼리 (Announcement 관련) ===");
  const r1 = await pool.query(`
    SELECT pid, state, wait_event_type, wait_event,
           NOW() - query_start AS dur,
           LEFT(query, 200) AS q
    FROM pg_stat_activity
    WHERE state != 'idle' AND query ILIKE '%Announcement%'
    ORDER BY query_start
  `);
  for (const row of r1.rows) {
    console.log(`pid=${row.pid} state=${row.state} wait=${row.wait_event_type}/${row.wait_event} dur=${row.dur}`);
    console.log(`  ${row.q}`);
  }

  console.log("\n=== Block 관계 ===");
  const r2 = await pool.query(`
    SELECT
      blocked.pid AS blocked_pid,
      blocking.pid AS blocking_pid,
      LEFT(blocked.query, 100) AS blocked_q,
      LEFT(blocking.query, 100) AS blocking_q
    FROM pg_stat_activity blocked
    JOIN pg_stat_activity blocking
      ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
    WHERE blocked.state != 'idle'
  `);
  if (r2.rows.length === 0) console.log("  block 관계 없음");
  for (const row of r2.rows) {
    console.log(`blocked=${row.blocked_pid} ← blocking=${row.blocking_pid}`);
    console.log(`  blocked_q: ${row.blocked_q}`);
    console.log(`  blocking_q: ${row.blocking_q}`);
  }

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
