import { Pool } from "pg";
import * as fs from "fs"; import * as path from "path";
let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") dbUrl = v;
}
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 10000 });
(async () => {
  // 단일 row PK index 사용 — 매우 빠름
  const r1 = await pool.query(`SELECT id, "createdAt" FROM "AnnouncementChgHst" ORDER BY id DESC LIMIT 1`);
  if (r1.rows[0]) {
    const last = r1.rows[0];
    console.log(`AnnouncementChgHst 최근 row: id=${last.id} createdAt=${last.createdAt}`);
    
    // 그 row 의 deadline ym 단일 lookup (PK index)
    const r2 = await pool.query(`SELECT to_char(deadline, 'YYYY-MM') AS ym FROM "Announcement" WHERE id = (SELECT "annId" FROM "AnnouncementChgHst" WHERE id = $1)`, [last.id]);
    console.log(`  → deadline ym: ${r2.rows[0]?.ym || '?'}`);
  }
  
  // CrawlLog 마지막 cursor
  const r3 = await pool.query(`SELECT "logType", "lastSuccess", "createdAt" FROM "CrawlLog" WHERE "logType" LIKE 'HIST%' ORDER BY "createdAt" DESC LIMIT 5`);
  console.log(`\nCrawlLog 최근 5:`);
  for (const r of r3.rows) console.log(`  ${r.logType}: ${r.lastSuccess} (${r.createdAt})`);
  
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
