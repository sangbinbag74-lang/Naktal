/** 읽기 전용 — 테스트로 잘못 생성된 scorecard-at:* dedup 키 확인 */
import { Pool } from "pg";
import * as fs from "fs"; import * as path from "path";
function loadDb() {
  const env = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(env, "utf-8");
  for (const l of c.split("\n")) { const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i === -1) continue;
    const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "DATABASE_URL" && v) return v; } throw new Error();
}
(async () => {
  const pool = new Pool({ connectionString: loadDb(), max: 1 });
  const c = await pool.connect();
  const r = await c.query(`SELECT key, "updatedAt" FROM "RateLimit" WHERE key LIKE 'scorecard-at:%' ORDER BY "updatedAt" DESC`);
  console.log(`scorecard-at:* 키 ${r.rows.length}건:`);
  for (const row of r.rows) console.log(`  ${String(row.updatedAt).slice(0, 19)} | ${row.key}`);
  c.release(); await pool.end();
})();
