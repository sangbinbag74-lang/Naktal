import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadDatabaseUrl(): string | undefined {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  try {
    const c = fs.readFileSync(rootEnv, "utf-8");
    for (const l of c.split("\n")) {
      const t = l.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k === "DATABASE_URL" && v && !v.includes("[YOUR-PASSWORD]")) return v;
    }
  } catch {}
  return process.env.DATABASE_URL;
}

async function main() {
  const pool = new Pool({ connectionString: loadDatabaseUrl()!, max: 1 });
  const c = await pool.connect();
  try {
    const r = await c.query(`
      SELECT pid, state, wait_event_type, wait_event, query_start,
             LEFT(query, 200) AS q
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid != pg_backend_pid()
        AND state != 'idle'
      ORDER BY query_start
    `);
    console.log(`활성 쿼리 ${r.rowCount}건:\n`);
    for (const row of r.rows) {
      const age = ((Date.now() - new Date(row.query_start).getTime()) / 1000).toFixed(0);
      console.log(`PID ${row.pid} | state=${row.state} | wait=${row.wait_event_type}/${row.wait_event} | 경과 ${age}초`);
      console.log(`  ${row.q.replace(/\s+/g, ' ').slice(0, 180)}`);
      console.log();
    }
  } finally {
    c.release();
    await pool.end();
  }
}
main().catch(console.error);
