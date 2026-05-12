import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    // 우리가 자초한 좀비 모두 종료 (cntrctMthdNm SELECT + ALTER 대기 + REFRESH MV)
    const r = await p.query(`
      SELECT pid, query
      FROM pg_stat_activity
      WHERE state != 'idle'
        AND (
          query LIKE '%cntrctMthdNm%'
          OR query LIKE '%ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "pdf%'
          OR query LIKE '%REFRESH MATERIALIZED VIEW CONCURRENTLY%'
        )
        AND query NOT LIKE '%pg_stat_activity%'
    `);
    process.stdout.write("KILL_TARGETS=" + r.rowCount + "\n");
    for (const row of r.rows) {
      try {
        await p.query(`SELECT pg_terminate_backend($1)`, [row.pid]);
        process.stdout.write(`  killed PID=${row.pid}\n`);
      } catch (e) {
        process.stdout.write(`  fail PID=${row.pid}: ${(e as Error).message}\n`);
      }
    }
    process.stdout.write("DONE\n");
  } catch (e) {
    process.stderr.write("ERR=" + (e as Error).message + "\n");
  } finally {
    await p.end();
    process.exit(0);
  }
})();
