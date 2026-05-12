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
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 60000 });

(async () => {
  const r = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE "updatedAt" > NOW() - INTERVAL '1 hour')::bigint AS r1h,
      COUNT(*) FILTER (WHERE "updatedAt" > NOW() - INTERVAL '10 minutes')::bigint AS r10m
    FROM "BidOpeningDetail"
  `);
  console.log(`BidOpeningDetail UPDATE: 1h=${r.rows[0].r1h} / 10m=${r.rows[0].r10m}`);

  const r2 = await pool.query(`
    SELECT TO_CHAR("openingDate", 'YYYY-MM') AS ym, COUNT(*)::int AS cnt
    FROM "BidOpeningDetail"
    WHERE "updatedAt" > NOW() - INTERVAL '15 minutes'
      AND "openingDate" IS NOT NULL
    GROUP BY 1 ORDER BY 1 DESC LIMIT 30
  `);
  console.log("\n=== 최근 15분 UPDATE 의 openingDate ym ===");
  for (const row of r2.rows) {
    console.log(`  ${row.ym}: +${row.cnt}`);
  }

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
