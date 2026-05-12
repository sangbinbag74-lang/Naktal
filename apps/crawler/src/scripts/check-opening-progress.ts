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
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 30000 });

(async () => {
  const r1 = await pool.query(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL '1 hour')::bigint AS r1h,
      COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL '10 minutes')::bigint AS r10m
    FROM "BidOpeningDetail"
  `);
  console.log("=== BidOpeningDetail INSERT (opening 진행 추적) ===");
  console.log(`  total=${Number(r1.rows[0].total).toLocaleString()}`);
  console.log(`  최근 1시간: +${Number(r1.rows[0].r1h).toLocaleString()}`);
  console.log(`  최근 10분:  +${Number(r1.rows[0].r10m).toLocaleString()}`);

  const r2 = await pool.query(`
    SELECT TO_CHAR("openingDate", 'YYYY-MM') AS ym, COUNT(*)::int AS cnt
    FROM "BidOpeningDetail"
    WHERE "createdAt" > NOW() - INTERVAL '15 minutes'
      AND "openingDate" IS NOT NULL
    GROUP BY 1 ORDER BY 1 DESC LIMIT 30
  `);
  console.log("\n=== 최근 15분 BidOpeningDetail INSERT 의 openingDate ym ===");
  for (const row of r2.rows) {
    console.log(`  ${row.ym}: +${row.cnt}`);
  }

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
