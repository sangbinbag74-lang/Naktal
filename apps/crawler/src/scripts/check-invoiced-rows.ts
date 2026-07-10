/** 읽기 전용 — BidRequest 수수료 invoiced 잔존 데이터 확인 */
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
  const st = await c.query(`SELECT "feeStatus", COUNT(*)::bigint AS n, SUM("feeAmount") AS amt FROM "BidRequest" GROUP BY 1 ORDER BY 2 DESC`);
  console.log("BidRequest feeStatus 분포:");
  for (const r of st.rows) console.log(`  ${r.feeStatus ?? "NULL"}: ${r.n}건, feeAmount 합 ${r.amt ?? 0}`);
  const inv = await c.query(`SELECT id, "konepsId", "feeAmount", "isWon", "createdAt" FROM "BidRequest" WHERE "feeStatus"='invoiced' ORDER BY "createdAt" DESC LIMIT 10`);
  if (inv.rows.length) {
    console.log("\ninvoiced 표본:");
    for (const r of inv.rows) console.log(`  ${String(r.createdAt).slice(0, 10)} | ${r.konepsId} | ${r.feeAmount}원 | isWon=${r.isWon}`);
  }
  c.release(); await pool.end();
})();
