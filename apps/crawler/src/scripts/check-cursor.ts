import { Pool } from "pg";
import * as fs from "fs"; import * as path from "path";
let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) { const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") dbUrl = v; }
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 8000 });
(async () => {
  const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='CrawlLog'`);
  console.log("CrawlLog cols:", cols.rows.map(r => r.column_name).join(", "));
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
