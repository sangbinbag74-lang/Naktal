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
  // SajungRateStat 데이터 분포 진단
  console.log("=== SajungRateStat 통계 ===");
  const r1 = await pool.query(`SELECT COUNT(*)::int AS total, COUNT(DISTINCT "orgName")::int AS orgs, COUNT(DISTINCT category)::int AS cats FROM "SajungRateStat"`);
  console.log(`  total: ${r1.rows[0].total}, orgs: ${r1.rows[0].orgs}, cats: ${r1.rows[0].cats}`);
  
  console.log("\n=== sampleSize 분포 ===");
  const r2 = await pool.query(`SELECT 
    COUNT(*) FILTER (WHERE "sampleSize" >= 30)::int AS strong,
    COUNT(*) FILTER (WHERE "sampleSize" BETWEEN 5 AND 29)::int AS medium,
    COUNT(*) FILTER (WHERE "sampleSize" < 5)::int AS weak
  FROM "SajungRateStat"`);
  console.log(`  strong (≥30): ${r2.rows[0].strong}, medium (5-29): ${r2.rows[0].medium}, weak (<5): ${r2.rows[0].weak}`);
  
  console.log("\n=== avg 분포 (사정율 평균) ===");
  const r3 = await pool.query(`SELECT 
    MIN(avg)::float AS min_avg,
    MAX(avg)::float AS max_avg,
    AVG(avg)::float AS overall_avg,
    STDDEV(avg)::float AS stddev_avg
  FROM "SajungRateStat" WHERE "sampleSize" >= 5`);
  console.log(`  min: ${r3.rows[0].min_avg?.toFixed(2)}, max: ${r3.rows[0].max_avg?.toFixed(2)}, mean: ${r3.rows[0].overall_avg?.toFixed(2)}, std: ${r3.rows[0].stddev_avg?.toFixed(2)}`);
  
  // 최근 갱신 시점
  console.log("\n=== 최근 갱신 ===");
  const r4 = await pool.query(`SELECT MAX("updatedAt") AS last FROM "SajungRateStat"`);
  console.log(`  last updated: ${r4.rows[0].last}`);
  
  // 표본 ALL 카테고리 (폴백)
  console.log("\n=== ALL 카테고리 (폴백 데이터) 표본 5건 ===");
  const r5 = await pool.query(`SELECT "orgName", category, "budgetRange", region, avg, "sampleSize" FROM "SajungRateStat" WHERE category = 'ALL' ORDER BY "sampleSize" DESC LIMIT 5`);
  for (const row of r5.rows) console.log(`  ${row.orgName} | ${row.region} | ${row.budgetRange} | avg=${row.avg} | n=${row.sampleSize}`);
  
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
