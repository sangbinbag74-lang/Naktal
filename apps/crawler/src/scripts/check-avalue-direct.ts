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
  return "";
}
(async () => {
  const pool = new Pool({ connectionString: loadDbUrl(), statement_timeout: 60000 });
  const r = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE "aValueTotal" > 0)::bigint AS filled,
      COUNT(*) FILTER (WHERE "aValueYn" = 'Y')::bigint AS yn_y,
      COUNT(*)::bigint AS total
    FROM "Announcement"
  `);
  process.stdout.write(`전체: ${r.rows[0].total}\n`);
  process.stdout.write(`aValueTotal > 0: ${r.rows[0].filled}\n`);
  process.stdout.write(`aValueYn = 'Y': ${r.rows[0].yn_y}\n`);
  process.stdout.write(`채움율: ${(Number(r.rows[0].filled)/Number(r.rows[0].total)*100).toFixed(2)}%\n`);
  await pool.end();
})();
