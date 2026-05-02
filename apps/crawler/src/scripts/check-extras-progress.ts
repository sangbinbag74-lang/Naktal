import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
function loadDb() {
  const env = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(env, "utf-8");
  for (const l of c.split("\n")) {
    const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "DATABASE_URL" && v) return v;
  }
  throw new Error();
}
(async () => {
  const pool = new Pool({ connectionString: loadDb(), max: 1, statement_timeout: 30000 });
  const c = await pool.connect();
  const r1 = await c.query(`
    SELECT date_trunc('month', "chgDate") AS ym, COUNT(*)::int AS n
    FROM "AnnouncementChgHst"
    WHERE "chgDate" >= '2008-01-01' AND "chgDate" < '2027-01-01'
    GROUP BY 1 ORDER BY 1 DESC LIMIT 15
  `);
  console.log("=== AnnouncementChgHst 최근 chgDate 월별 (top 15) ===");
  for (const r of r1.rows) console.log(`  ${r.ym?.toISOString().slice(0,7)} : ${r.n.toLocaleString()}`);
  const r2 = await c.query(`SELECT MAX("chgDate") AS mx FROM "AnnouncementChgHst"`);
  console.log(`\n최대 chgDate: ${r2.rows[0].mx?.toISOString()}`);
  c.release(); await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
