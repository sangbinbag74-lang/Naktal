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
  const tests = [
    { name: "전체 최신 10", sql: `SELECT id, "konepsId", title FROM "AnnouncementActive" ORDER BY "createdAt" DESC LIMIT 10` },
    { name: "카테고리 시설공사", sql: `SELECT id, "konepsId", title FROM "AnnouncementActive" WHERE category='시설공사' ORDER BY deadline ASC LIMIT 10` },
    { name: "지역 서울", sql: `SELECT id, "konepsId", title FROM "AnnouncementActive" WHERE region='서울' ORDER BY deadline ASC LIMIT 10` },
    { name: "subCat 전기공사업", sql: `SELECT id, "konepsId", title FROM "AnnouncementActive" WHERE "subCategories" @> ARRAY['전기공사업']::text[] ORDER BY deadline ASC LIMIT 10` },
  ];
  for (const t of tests) {
    const t0 = Date.now();
    const r = await pool.query(t.sql);
    console.log(`${t.name}: ${Date.now()-t0}ms (${r.rows.length}건)`);
  }
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
