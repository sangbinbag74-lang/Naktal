import { Pool } from "pg";
import * as fs from "fs"; import * as path from "path";
let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) { const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") dbUrl = v; }
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 600000 });
(async () => {
  console.log("=== 1. AnnouncementActive Materialized View 생성 ===");
  const t0 = Date.now();
  await pool.query(`DROP MATERIALIZED VIEW IF EXISTS "AnnouncementActive" CASCADE`);
  await pool.query(`
    CREATE MATERIALIZED VIEW "AnnouncementActive" AS
    SELECT * FROM "Announcement" WHERE deadline > NOW()
  `);
  console.log(`  생성 완료: ${((Date.now()-t0)/1000).toFixed(1)}초`);
  
  // unique index — REFRESH CONCURRENTLY 필수
  console.log("\n=== 2. UNIQUE INDEX (id) ===");
  await pool.query(`CREATE UNIQUE INDEX ON "AnnouncementActive" (id)`);
  
  console.log("\n=== 3. 검색용 인덱스 ===");
  await pool.query(`CREATE INDEX ON "AnnouncementActive" (deadline DESC)`);
  await pool.query(`CREATE INDEX ON "AnnouncementActive" ("createdAt" DESC)`);
  await pool.query(`CREATE INDEX ON "AnnouncementActive" (category)`);
  await pool.query(`CREATE INDEX ON "AnnouncementActive" (region)`);
  await pool.query(`CREATE INDEX ON "AnnouncementActive" USING gin ("subCategories")`);
  
  // row 수
  const r = await pool.query(`SELECT COUNT(*)::int AS c FROM "AnnouncementActive"`);
  console.log(`\n=== row 수: ${r.rows[0].c} ===`);
  
  await pool.query(`ANALYZE "AnnouncementActive"`);
  console.log("\n=== ANALYZE 완료 ===");
  await pool.end();
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
