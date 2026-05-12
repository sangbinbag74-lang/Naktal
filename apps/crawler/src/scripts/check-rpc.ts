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
  const r = await pool.query(`SELECT proname FROM pg_proc WHERE proname LIKE 'search_%' OR proname LIKE '%announcement%'`);
  console.log("관련 함수:");
  for (const row of r.rows) console.log(`  ${row.proname}`);
  
  // 인덱스 확인
  const i = await pool.query(`
    SELECT indexname, indexdef FROM pg_indexes 
    WHERE tablename = 'Announcement' AND (indexdef LIKE '%subCategories%' OR indexdef LIKE '%category%' OR indexdef LIKE '%region%' OR indexdef LIKE '%deadline%')
  `);
  console.log("\nAnnouncement 인덱스:");
  for (const row of i.rows) console.log(`  ${row.indexname}: ${row.indexdef.substring(0,100)}`);
  
  await pool.end();
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
