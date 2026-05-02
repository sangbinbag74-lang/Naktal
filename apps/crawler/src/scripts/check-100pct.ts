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
  const pool = new Pool({ connectionString: loadDbUrl(), statement_timeout: 120000 });
  const r = await pool.query(`
    SELECT to_char(date_trunc('month', "openingDate"), 'YYYY-MM') AS ym,
           COUNT(*) FILTER (WHERE array_length("selPrdprcIdx", 1) >= 4)::bigint AS f,
           COUNT(*)::bigint AS t
    FROM "BidOpeningDetail"
    WHERE "openingDate" >= '2002-01-01' AND "openingDate" < '2027-01-01'
    GROUP BY 1 ORDER BY 1
  `);
  let total100 = 0, totalAll = 0;
  for (const row of r.rows) {
    const f = Number(row.f), t = Number(row.t);
    totalAll++;
    if (t === 0 || f === t) total100++;
    else process.stdout.write(`${row.ym}: ${f}/${t} (${(f/t*100).toFixed(1)}%)\n`);
  }
  process.stdout.write(`\n100% 월: ${total100}/${totalAll}\n`);
  await pool.end();
})();
