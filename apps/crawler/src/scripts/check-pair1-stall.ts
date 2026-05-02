import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";
function loadDbUrl(): string {
  const c = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
  for (const l of c.split("\n")) {
    const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i < 0) continue;
    if (t.slice(0, i).trim() === "DATABASE_URL") return t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return process.env.DATABASE_URL!;
}
(async () => {
  const pool = new Pool({ connectionString: loadDbUrl(), statement_timeout: 30000 });
  const r = await pool.query(`
    SELECT pid, state, wait_event_type, wait_event,
           EXTRACT(EPOCH FROM (now()-query_start))::int AS sec,
           LEFT(query, 200) AS q
    FROM pg_stat_activity
    WHERE state != 'idle' AND query NOT LIKE '%pg_stat_activity%'
    ORDER BY query_start
  `);
  process.stdout.write(`=== 활성 쿼리: ${r.rows.length}건 ===\n`);
  for (const row of r.rows) {
    process.stdout.write(`pid=${row.pid} sec=${row.sec} ${row.wait_event_type}/${row.wait_event} ${row.state}\n`);
    process.stdout.write(`  ${row.q.replace(/\s+/g, " ")}\n`);
  }
  const v = await pool.query(`SELECT COUNT(*) FILTER (WHERE array_length("selPrdprcIdx",1)>=4)::bigint AS f, COUNT(*)::bigint AS t FROM "BidOpeningDetail" WHERE "openingDate" >= '2012-02-01' AND "openingDate" < '2012-03-01'`);
  process.stdout.write(`2012-02 현재: ${v.rows[0].f}/${v.rows[0].t}\n`);
  await pool.end();
})();
