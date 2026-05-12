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
    { name: "201001~201412", from: "2010-01-01", to: "2014-12-31" },
    { name: "201501~201912", from: "2015-01-01", to: "2019-12-31" },
    { name: "202001~202112", from: "2020-01-01", to: "2021-12-31" },
    { name: "202001~202605", from: "2020-01-01", to: "2026-05-31" },
    { name: "202401~202512", from: "2024-01-01", to: "2025-12-31" },
  ];
  for (const r of ranges) {
    const q = await pool.query(`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE "bsisAmt"::text != '0')::int AS bsis,
        COUNT(*) FILTER (WHERE array_length("subCategories",1) > 0)::int AS sub
      FROM "Announcement" WHERE deadline >= $1 AND deadline <= $2
    `, [r.from, r.to]);
    const { total, bsis, sub } = q.rows[0];
    if (total > 0) {
      console.log(`${r.name}: total=${total}, bsis=${(bsis*100/total).toFixed(1)}%, sub=${(sub*100/total).toFixed(1)}%`);
    }
  }
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
