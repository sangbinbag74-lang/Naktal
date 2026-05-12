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
  // CrawlLog 최근 BULK_EXTRAS / EXTRAS / HIST type 5건
  const r = await pool.query(`
    SELECT "type", "status", "count", "createdAt"
    FROM "CrawlLog"
    WHERE "createdAt" > NOW() - INTERVAL '30 minutes'
    ORDER BY "createdAt" DESC LIMIT 10
  `);
  console.log(`최근 30분 CrawlLog: ${r.rows.length}개`);
  for (const row of r.rows) {
    console.log(`  ${row.type} | ${row.status} | count=${row.count} | ${row.createdAt}`);
  }
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
