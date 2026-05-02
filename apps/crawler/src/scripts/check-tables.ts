import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadDatabaseUrl(): string {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(rootEnv, "utf-8");
  for (const l of c.split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "DATABASE_URL" && v) return v;
  }
  return process.env.DATABASE_URL!;
}

(async () => {
  const pool = new Pool({ connectionString: loadDatabaseUrl(), statement_timeout: 15000 });
  try {
    for (const t of ["AnnouncementChgHst", "PreStdrd"]) {
      const r = await pool.query(`SELECT n_live_tup::bigint AS live FROM pg_stat_user_tables WHERE relname=$1`, [t]);
      console.log(t, "live:", r.rows[0]?.live);
      const c = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`,
        [t],
      );
      console.log(t, "cols:", c.rows.map((r) => r.column_name).join(", "));
    }
  } catch (e) {
    console.error("ERR", (e as Error).message);
  } finally {
    await pool.end();
  }
})();
