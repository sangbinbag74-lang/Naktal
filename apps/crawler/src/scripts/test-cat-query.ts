import { Pool } from "pg";
import * as fs from "fs"; import * as path from "path";
let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) { const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") dbUrl = v; }
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 60000 });
(async () => {
  // EXPLAIN ANALYZE 카테고리 필터
  const t0 = Date.now();
  const r = await pool.query(`
    SELECT id, "konepsId", title, "orgName", category, deadline 
    FROM "Announcement" 
    WHERE category = '시설공사' AND deadline > NOW() 
    ORDER BY deadline ASC LIMIT 2
  `);
  console.log(`SELECT 시간: ${((Date.now()-t0)/1000).toFixed(2)}초, ${r.rows.length}건`);
  for (const row of r.rows) console.log(`  ${row.konepsId} | ${row.title?.substring(0,40)}`);
  
  // search_announcements RPC 테스트
  const t1 = Date.now();
  const r2 = await pool.query(`SELECT * FROM search_announcements(p_categories => ARRAY['시설공사']::text[], p_limit => 2, p_offset => 0)`);
  console.log(`\nRPC 시간: ${((Date.now()-t1)/1000).toFixed(2)}초, ${r2.rows.length}건`);
  for (const row of r2.rows) console.log(`  ${row.konepsId || '?'} | ${row.title?.substring(0,40) || '?'}`);
  await pool.end();
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
