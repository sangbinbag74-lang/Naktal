import { Pool } from "pg";
import * as fs from "fs"; import * as path from "path";
let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) { const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") dbUrl = v; }
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 5000 });
(async () => {
  const r1 = await pool.query(`SELECT relname, n_tup_ins, n_tup_upd, n_live_tup FROM pg_stat_user_tables WHERE relname IN ('Announcement','AnnouncementChgHst','PreStdrd')`);
  console.log("=== T0 stat ===");
  for (const r of r1.rows) console.log(`  ${r.relname}: ins=${r.n_tup_ins} upd=${r.n_tup_upd} live=${r.n_live_tup}`);
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
