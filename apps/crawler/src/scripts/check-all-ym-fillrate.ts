import { Pool } from "pg";
import * as fs from "fs"; import * as path from "path";
let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) { const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") dbUrl = v; }
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 90000 });
(async () => {
  // 2002-01 ~ 2026-05 모든 ym 채움률 단일 query
  const r = await pool.query(`
    SELECT
      to_char(deadline, 'YYYY-MM') AS ym,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE "bsisAmt"::text != '0')::int AS bsis,
      COUNT(*) FILTER (WHERE array_length("subCategories",1) > 0)::int AS sub
    FROM "Announcement"
    WHERE deadline >= '2002-01-01' AND deadline <= '2026-05-31'
    GROUP BY ym
    ORDER BY ym
  `);
  const insufficient: string[] = [];
  console.log(`총 ${r.rows.length}개 ym 측정`);
  for (const row of r.rows) {
    const bp = row.total > 0 ? row.bsis*100/row.total : 0;
    const sp = row.total > 0 ? row.sub*100/row.total : 0;
    // 부족 기준: bsis < 80% 또는 sub < 80%
    if (row.total > 0 && (bp < 80 || sp < 80)) {
      insufficient.push(row.ym.replace("-",""));
    }
  }
  console.log(`\n부족 ym (bsis<80% OR sub<80%): ${insufficient.length}개`);
  console.log(insufficient.join(","));
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
