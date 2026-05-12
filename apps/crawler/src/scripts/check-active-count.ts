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
  console.log("=== 활성 공고 (deadline > NOW()) ===");
  const r1 = await pool.query(`SELECT COUNT(*)::bigint AS c FROM "Announcement" WHERE deadline > NOW()`);
  console.log(`  row 수: ${r1.rows[0].c}`);
  
  console.log("\n=== 마감 임박 (앞으로 30일) ===");
  const r2 = await pool.query(`SELECT COUNT(*)::bigint AS c FROM "Announcement" WHERE deadline > NOW() AND deadline < NOW() + INTERVAL '30 days'`);
  console.log(`  row 수: ${r2.rows[0].c}`);
  
  console.log("\n=== 최근 7일 내 적재 (createdAt) ===");
  const r3 = await pool.query(`SELECT COUNT(*)::bigint AS c FROM "Announcement" WHERE "createdAt" > NOW() - INTERVAL '7 days'`);
  console.log(`  row 수: ${r3.rows[0].c}`);
  
  console.log("\n=== 마감 공고 + 옛 공고 ===");
  const r4 = await pool.query(`SELECT COUNT(*)::bigint AS c FROM "Announcement" WHERE deadline <= NOW()`);
  console.log(`  row 수: ${r4.rows[0].c}`);
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
