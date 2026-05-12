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
  const ym = process.argv[2] || "2024-06";
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
  if (total > 0) console.log(`${ym}: total=${total} | bsis=${(bsis*100/total).toFixed(1)}% | sub=${(sub*100/total).toFixed(1)}%`);
  else console.log(`${ym}: 0`);
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
