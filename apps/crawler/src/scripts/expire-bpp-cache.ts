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
  const before = await pool.query(`SELECT COUNT(*)::int AS c FROM "BidPricePrediction" WHERE "expiresAt" > NOW()`);
  console.log(`만료 전 활성 캐시: ${before.rows[0].c}`);
  
  const r = await pool.query(`UPDATE "BidPricePrediction" SET "expiresAt" = NOW() WHERE "expiresAt" > NOW()`);
  console.log(`만료 처리: ${r.rowCount} row`);
  
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
