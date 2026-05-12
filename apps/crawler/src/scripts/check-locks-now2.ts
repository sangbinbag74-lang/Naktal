import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    const r = await p.query(`
      SELECT pid, usename, state, wait_event_type, wait_event, query_start::text,
             LEFT(query, 200) AS query
      FROM pg_stat_activity
      WHERE state != 'idle' AND query NOT LIKE '%pg_stat_activity%'
      ORDER BY query_start ASC
      LIMIT 20
    `);
    process.stdout.write("ACTIVE_QUERIES=" + r.rowCount + "\n");
    for (const row of r.rows) {
      process.stdout.write(`PID=${row.pid} ${row.state} ${row.wait_event_type ?? "-"}/${row.wait_event ?? "-"} since=${row.query_start}\n`);
      process.stdout.write(`  ${row.query}\n`);
    }
  } catch (e) {
    process.stderr.write("ERR=" + (e as Error).message + "\n");
  } finally {
    await p.end();
    process.exit(0);
  }
})();
