import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") dbUrl = v;
}
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 0 });

(async () => {
  console.log("=== aValueTotal 채움률 (전체) ===");
  const r = await pool.query(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "aValueTotal" > 0)::bigint AS filled
    FROM "Announcement"
  `);
  const total = Number(r.rows[0].total);
  const filled = Number(r.rows[0].filled);
  console.log(`  total=${total.toLocaleString()} / filled=${filled.toLocaleString()} (${((filled / total) * 100).toFixed(2)}%)`);

  console.log("\n=== aValueTotal 채움률 (연도별) ===");
  const r2 = await pool.query(`
    SELECT
      EXTRACT(YEAR FROM "deadline")::int AS yr,
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "aValueTotal" > 0)::bigint AS filled
    FROM "Announcement"
    WHERE "deadline" >= '2018-01-01'::date
    GROUP BY 1 ORDER BY 1
  `);
  for (const row of r2.rows) {
    const t = Number(row.total), f = Number(row.filled);
    console.log(`  ${row.yr}: total=${t.toLocaleString().padStart(9)} filled=${f.toLocaleString().padStart(9)} (${((f / t) * 100).toFixed(1)}%)`);
  }

  console.log("\n=== aValueTotal 표본 5건 (최근 deadline) ===");
  const r3 = await pool.query(`
    SELECT "konepsId", "deadline"::date, "aValueTotal", "aValueAmt", "aValueYn"
    FROM "Announcement"
    WHERE "aValueTotal" > 0
    ORDER BY "deadline" DESC LIMIT 5
  `);
  for (const row of r3.rows) {
    console.log(`  ${row.konepsId} dl=${row.deadline} total=${Number(row.aValueTotal).toLocaleString()} amt=${Number(row.aValueAmt).toLocaleString()} yn='${row.aValueYn}'`);
  }

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
