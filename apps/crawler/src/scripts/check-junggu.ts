import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    console.log("=== Announcement orgName / region ===");
    const a = await p.query(`SELECT "orgName", region FROM "Announcement" WHERE title='다산로 생활녹지축 조성 공사' LIMIT 1`);
    console.log(" ", a.rows[0]);
    if (!a.rows[0]) return;
    
    console.log(`\n=== SajungRateStat WHERE orgName ILIKE '서울특별시 중구%' AND category='조경식재공사' ===`);
    const r = await p.query(`SELECT "orgName", "budgetRange", region, "sampleSize" FROM "SajungRateStat" WHERE "orgName" ILIKE '서울특별시 중구%' AND category='조경식재공사' LIMIT 20`);
    console.log("rows:", r.rowCount);
    for (const row of r.rows) console.log(" ", row.orgName, "|", row.budgetRange, "|", JSON.stringify(row.region), "|", row.sampleSize);
    
    console.log(`\n=== SajungRateStat WHERE orgName ILIKE '서울%' AND category='조경식재공사' (top 10) ===`);
    const r2 = await p.query(`SELECT "orgName", "budgetRange", region, "sampleSize" FROM "SajungRateStat" WHERE "orgName" ILIKE '서울%' AND category='조경식재공사' ORDER BY "sampleSize" DESC LIMIT 10`);
    for (const row of r2.rows) console.log(" ", row.orgName, "|", row.budgetRange, "|", JSON.stringify(row.region), "|", row.sampleSize);
  } finally { await p.end(); }
})().catch(e => { console.error(e); process.exit(1); });
