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
    SELECT to_char(date_trunc('month', "openingDate"),'YYYY-MM') AS ym,
           COUNT(*) FILTER (WHERE array_length("selPrdprcIdx",1)>=4)::bigint AS f,
           COUNT(*)::bigint AS t
    FROM "BidOpeningDetail"
    WHERE "openingDate" >= '2012-02-01' AND "openingDate" < '2012-04-01'
    GROUP BY 1 ORDER BY 1
  `);
  for (const row of r.rows) process.stdout.write(`${row.ym}: ${row.f}/${row.t}\n`);
  await pool.end();
})();
