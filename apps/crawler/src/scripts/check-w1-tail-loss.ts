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
  // w1 미완 영역만: 200811~200912 (14 ym)
  const r = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE "bsisAmt"::text != '0')::int AS bsis,
      COUNT(*) FILTER (WHERE array_length("subCategories",1) > 0)::int AS sub,
      COUNT(*) FILTER (WHERE "ciblAplYn" != '')::int AS cibl
    FROM "Announcement"
    WHERE deadline >= '2008-11-01' AND deadline <= '2009-12-31'
      AND ("category" LIKE '%공사%' OR "category" = '시설공사')
  `);
  const row = r.rows[0];
  console.log(`w1 미완 영역 (200811~200912 Cnstwk):`);
  console.log(`  total=${row.total}`);
  console.log(`  bsisAmt > 0:        ${row.bsis} (${(row.bsis*100/row.total).toFixed(1)}%)`);
  console.log(`  subCategories:      ${row.sub} (${(row.sub*100/row.total).toFixed(1)}%)`);
  console.log(`  ciblAplYn:          ${row.cibl} (${(row.cibl*100/row.total).toFixed(1)}%)`);

  // 비교: 처리 완료된 영역 (200201~200810)
  const r2 = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE "bsisAmt"::text != '0')::int AS bsis,
      COUNT(*) FILTER (WHERE array_length("subCategories",1) > 0)::int AS sub
    FROM "Announcement"
    WHERE deadline >= '2002-01-01' AND deadline <= '2008-10-31'
      AND ("category" LIKE '%공사%' OR "category" = '시설공사')
  `);
  const row2 = r2.rows[0];
  console.log(`\n비교: w1 처리완료 영역 (200201~200810 Cnstwk):`);
  console.log(`  total=${row2.total}`);
  console.log(`  bsisAmt > 0:        ${row2.bsis} (${(row2.bsis*100/row2.total).toFixed(1)}%)`);
  console.log(`  subCategories:      ${row2.sub} (${(row2.sub*100/row2.total).toFixed(1)}%)`);

  console.log(`\n→ 두 영역 채움률 차이 = w1 죽음 영향 (작을수록 손실 적음)`);

  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
