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
  console.log("=== 2025+ annId 형식 검증 ===");
  const r1 = await pool.query(`SELECT "annId" FROM "BidOpeningDetail" WHERE "annId" LIKE 'R25%' OR "annId" LIKE 'R26%' LIMIT 5`);
  console.log("R25/R26 표본:");
  for (const row of r1.rows) console.log(" ", row.annId);

  const r2 = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE "annId" LIKE 'R25%')::int AS r25,
      COUNT(*) FILTER (WHERE "annId" LIKE 'R26%')::int AS r26,
      COUNT(*) FILTER (WHERE "annId" LIKE 'R25%' AND jsonb_array_length("prdprcList") > 1)::int AS r25_filled,
      COUNT(*) FILTER (WHERE "annId" LIKE 'R26%' AND jsonb_array_length("prdprcList") > 1)::int AS r26_filled
    FROM "BidOpeningDetail"
  `);
  console.log("\n=== R25/R26 채움 ===");
  console.log(r2.rows[0]);

  const r3 = await pool.query(`
    SELECT "openingDate"::date AS d, COUNT(*) AS total, COUNT(*) FILTER (WHERE jsonb_array_length("prdprcList") > 1) AS filled
    FROM "BidOpeningDetail"
    WHERE "openingDate" >= '2025-01-01' AND "openingDate" < '2026-02-01'
    GROUP BY 1 ORDER BY 1 DESC LIMIT 30
  `);
  console.log("\n=== 2025+ openingDate 별 채움 (최근 30일) ===");
  for (const row of r3.rows) console.log(`  ${row.d}: ${row.total} total, ${row.filled} filled`);

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
