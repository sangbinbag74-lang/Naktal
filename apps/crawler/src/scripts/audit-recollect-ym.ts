import { Pool } from "pg";
import * as fs from "fs"; import * as path from "path";
let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) { const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") dbUrl = v; }
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 30000 });
(async () => {
  console.log("=== BidResult schema 확인 ===");
  const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='BidResult' LIMIT 20`);
  console.log(`  cols: ${cols.rows.map(r=>r.column_name).join(", ")}`);
  
  const r = await pool.query(`SELECT * FROM "BidResult" LIMIT 2`);
  console.log(`\nBidResult 표본 2건:`);
  for (const row of r.rows) console.log(`  ${JSON.stringify(row).substring(0,200)}`);
  
  console.log("\n=== 91 재수집 ym 표본 ===");
  for (const ym of ["2002-01", "2007-03", "2014-01", "2021-03", "2026-02"]) {
    const [y, m] = ym.split("-");
    const start = `${y}-${m}-01`;
    const next = m === "12" ? `${parseInt(y)+1}-01-01` : `${y}-${String(parseInt(m)+1).padStart(2,"0")}-01`;
    const q = await pool.query(`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE "bsisAmt"::text != '0')::int AS bsis,
        COUNT(*) FILTER (WHERE array_length("subCategories",1) > 0)::int AS sub
      FROM "Announcement" WHERE deadline >= $1::timestamptz AND deadline < $2::timestamptz
    `, [start, next]);
    const { total, bsis, sub } = q.rows[0];
    if (total > 0) console.log(`  ${ym}: total=${total} | bsis=${(bsis*100/total).toFixed(1)}% | sub=${(sub*100/total).toFixed(1)}%`);
    else console.log(`  ${ym}: total=0`);
  }
  await pool.end();
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
