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
  for (const year of ["2010","2015","2020","2024","2026"]) {
    const r = await pool.query(`
      SELECT "rawJson"
      FROM "Announcement"
      WHERE "category" = '시설공사' AND "deadline" >= $1::date AND "deadline" < $2::date
        AND "rawJson" IS NOT NULL
      LIMIT 1
    `, [`${year}-06-01`, `${year}-07-01`]);
    if (r.rows.length === 0) { console.log(`${year}: no row`); continue; }
    const raw = r.rows[0].rawJson;
    const keys = Object.keys(raw).filter(k => /sft|prm|cst|nsr|valu|amt|prce|fund|prearng|aValue|pls/i.test(k));
    console.log(`\n=== ${year}-06 시설공사 rawJson keys (A값 관련) ===`);
    for (const k of keys.sort()) {
      const v = raw[k];
      if (v !== null && v !== "" && v !== "0" && v !== 0) {
        console.log(`  ${k}: ${JSON.stringify(v).slice(0, 50)}`);
      }
    }
    console.log(`(총 ${Object.keys(raw).length} keys)`);
  }
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
