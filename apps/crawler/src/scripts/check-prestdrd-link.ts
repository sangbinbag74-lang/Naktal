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
  const pool = new Pool({ connectionString: loadDatabaseUrl(), statement_timeout: 30000 });
  try {
    const s = await pool.query(`SELECT "bfSpecRgstNo","bfSpecRgstNm" FROM "PreStdrd" LIMIT 5`);
    console.log("sample:", s.rows);
    const r = await pool.query(
      `SELECT COUNT(*)::bigint AS n FROM "PreStdrd" p WHERE EXISTS (SELECT 1 FROM "Announcement" a WHERE a."konepsId" = p."bfSpecRgstNo" LIMIT 1)`,
    );
    console.log("match by bfSpecRgstNo=konepsId:", r.rows[0]);
  } catch (e) {
    console.error("ERR", (e as Error).message);
  } finally {
    await pool.end();
  }
})();
