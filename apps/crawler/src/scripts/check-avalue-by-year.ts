import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") dbUrl = v;
}
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 0 });

(async () => {
  // 연도별 + 카테고리별 aValueTotal 채움률
  const r = await pool.query(`
    SELECT
      EXTRACT(YEAR FROM "deadline")::int AS year,
      "category",
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE "aValueTotal" > 0)::int AS a_filled,
      COUNT(*) FILTER (WHERE "bsisAmt" > 0)::int AS bs_filled
    FROM "Announcement"
    WHERE "deadline" IS NOT NULL AND "category" IN ('시설공사','용역','물품')
    GROUP BY 1, 2 ORDER BY 1, 2
  `);
  console.log("=== 연도별 카테고리별 aValueTotal / bsisAmt 채움률 ===");
  console.log("year | cat       | total   | bsisAmt | %     | aValue  | %");
  console.log("-----|-----------|---------|---------|-------|---------|------");
  for (const row of r.rows) {
    const total = row.total;
    const bs = row.bs_filled;
    const a = row.a_filled;
    const bsPct = total > 0 ? (100 * bs / total).toFixed(1) : "0.0";
    const aPct = total > 0 ? (100 * a / total).toFixed(1) : "0.0";
    console.log(`${row.year} | ${(row.category || "").padEnd(9)} | ${String(total).padStart(7)} | ${String(bs).padStart(7)} | ${bsPct.padStart(5)}% | ${String(a).padStart(7)} | ${aPct}%`);
  }
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
