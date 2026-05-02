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
      SELECT pg_terminate_backend(pid) AS killed, pid
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid != pg_backend_pid()
        AND state = 'active'
        AND (query LIKE '%Announcement%' OR query LIKE '%rawJson%')
    `);
    console.log(`종료된 쿼리 ${r.rowCount}건:`);
    for (const row of r.rows) {
      console.log(`  PID ${row.pid}: ${row.killed ? '성공' : '실패'}`);
    }
  } finally {
    c.release();
    await pool.end();
  }
}
main().catch(console.error);
