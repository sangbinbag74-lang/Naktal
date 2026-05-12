import { Pool } from "pg";
import * as fs from "fs"; import * as path from "path";
let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) { const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") dbUrl = v; }
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 10000 });
(async () => {
  const r = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='Announcement' ORDER BY ordinal_position`);
  console.log("Announcement columns:");
  for (const row of r.rows) console.log(`  ${row.column_name}`);
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
