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
  const ranges = [
    { name: "w1 (200201~200912)", from: "2002-01-01", to: "2009-09-30" },
    { name: "w3 (201501~201912)", from: "2015-01-01", to: "2019-12-31" },
    { name: "w4 (202001~현재)", from: "2020-01-01", to: "2026-12-31" },
    { name: "w6 (201301~현재)", from: "2013-01-01", to: "2026-12-31" },
  ];
  for (const r of ranges) {
    const ann = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE "bsisAmt"::text != '0')::int AS bsis,
        COUNT(*) FILTER (WHERE array_length("subCategories",1) > 0)::int AS sub
      FROM "Announcement"
      WHERE deadline >= '${r.from}' AND deadline <= '${r.to}'
        AND ("category" LIKE '%공사%' OR "category" = '시설공사')
    `);
    const t = ann.rows[0].total, b = ann.rows[0].bsis, s = ann.rows[0].sub;
    console.log(`${r.name}: Cnstwk total=${t} bsis=${b} (${(b*100/t).toFixed(1)}%) sub=${s} (${(s*100/t).toFixed(1)}%)`);
  }
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
