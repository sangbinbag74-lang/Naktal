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
  const pool = new Pool({ connectionString: loadDb(), max: 1, statement_timeout: 60000 });
  const c = await pool.connect();
  console.log("=== BidResult.openedAt 컬럼 채움율 ===");
  const r1 = await c.query(`
    SELECT COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "openedAt" IS NOT NULL)::bigint AS filled
    FROM "BidResult"
  `);
  const t = Number(r1.rows[0].total);
  console.log(`  total : ${t.toLocaleString()}`);
  console.log(`  openedAt IS NOT NULL : ${Number(r1.rows[0].filled).toLocaleString()} (${(Number(r1.rows[0].filled)/t*100).toFixed(1)}%)`);

  console.log("\n=== rawJson 에서 opengDt / rlOpengDt 키 존재율 (표본) ===");
  const r2 = await c.query(`
    WITH s AS (SELECT "rawJson" FROM "BidResult" TABLESAMPLE SYSTEM(1) WHERE "rawJson" IS NOT NULL)
    SELECT COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "rawJson" ? 'opengDt' AND NULLIF("rawJson"->>'opengDt','') IS NOT NULL)::bigint AS o_count,
      COUNT(*) FILTER (WHERE "rawJson" ? 'rlOpengDt' AND NULLIF("rawJson"->>'rlOpengDt','') IS NOT NULL)::bigint AS r_count,
      COUNT(*) FILTER (WHERE "rawJson" ? 'opengDate' AND NULLIF("rawJson"->>'opengDate','') IS NOT NULL)::bigint AS d_count
    FROM s
  `);
  const t2 = Number(r2.rows[0].total);
  console.log(`  표본 ${t2.toLocaleString()}건`);
  console.log(`  opengDt 비-빈 : ${Number(r2.rows[0].o_count).toLocaleString()} (${(Number(r2.rows[0].o_count)/t2*100).toFixed(1)}%)`);
  console.log(`  rlOpengDt 비-빈 : ${Number(r2.rows[0].r_count).toLocaleString()} (${(Number(r2.rows[0].r_count)/t2*100).toFixed(1)}%)`);
  console.log(`  opengDate 비-빈 : ${Number(r2.rows[0].d_count).toLocaleString()} (${(Number(r2.rows[0].d_count)/t2*100).toFixed(1)}%)`);

  console.log("\n=== rawJson 표본 5건의 키 + opengDt 값 ===");
  const r3 = await c.query(`SELECT "rawJson"->>'opengDt' AS o, "rawJson"->>'rlOpengDt' AS r FROM "BidResult" WHERE "rawJson" IS NOT NULL ORDER BY random() LIMIT 5`);
  for (const x of r3.rows) console.log(`  opengDt='${x.o}' rlOpengDt='${x.r}'`);
  c.release(); await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
