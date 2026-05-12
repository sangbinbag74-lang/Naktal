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
  const annId = "R26BK01512168";
  
  console.log("=== 1. Announcement 단일 조회 (id OR konepsId) ===");
  let t0 = Date.now();
  let r = await pool.query(`
    SELECT id, "konepsId", title, "orgName", category, region, "rawJson", "aValueYn", "aValueAmt", "aValueTotal", "bsisAmt", "subCategories"
    FROM "Announcement" WHERE id = $1 OR "konepsId" = $1 LIMIT 1
  `, [annId]);
  console.log(`  ${Date.now()-t0}ms | row=${r.rows.length}`);
  const annPk = r.rows[0]?.id;
  
  console.log("\n=== 2. BidRequest count ===");
  t0 = Date.now();
  r = await pool.query(`SELECT COUNT(*)::int FROM "BidRequest" WHERE "annId" = $1 AND "cancelledAt" IS NULL`, [annPk]);
  console.log(`  ${Date.now()-t0}ms | count=${r.rows[0].count}`);
  
  console.log("\n=== 3. BidPricePrediction 캐시 조회 ===");
  t0 = Date.now();
  r = await pool.query(`SELECT * FROM "BidPricePrediction" WHERE "annId" = $1 LIMIT 1`, [annPk]);
  console.log(`  ${Date.now()-t0}ms | row=${r.rows.length}`);
  
  console.log("\n=== 4. SajungRateStat (예시 — 발주처+업종+예산구간+지역) ===");
  t0 = Date.now();
  r = await pool.query(`
    SELECT * FROM "SajungRateStat"
    WHERE "orgName" = $1 AND category = $2
    ORDER BY "sampleSize" DESC LIMIT 5
  `, ["조달청", "시설공사"]);
  console.log(`  ${Date.now()-t0}ms | row=${r.rows.length}`);
  
  console.log("\n=== 5. AnnouncementActive 조회 (대안) ===");
  t0 = Date.now();
  r = await pool.query(`
    SELECT id, "konepsId" FROM "AnnouncementActive" WHERE id = $1 OR "konepsId" = $1 LIMIT 1
  `, [annId]);
  console.log(`  ${Date.now()-t0}ms | row=${r.rows.length}`);
  
  await pool.end();
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
