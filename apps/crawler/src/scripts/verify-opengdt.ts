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
  console.log("=== Announcement.rawJson 'opengDt' 실제 값 무작위 10건 ===");
  const r = await c.query(`SELECT "konepsId", "rawJson"->>'opengDt' AS opengdt FROM "Announcement" WHERE NULLIF("rawJson"->>'opengDt','') IS NOT NULL ORDER BY random() LIMIT 10`);
  if (r.rowCount === 0) console.log("  ❌ 값 없음");
  for (const row of r.rows) console.log(`  ${row.konepsId}: "${row.opengdt}"`);

  console.log("\n=== 채움율 (전수) ===");
  const r1 = await c.query(`SELECT COUNT(*)::bigint AS t, COUNT(*) FILTER (WHERE NULLIF("rawJson"->>'opengDt','') IS NOT NULL)::bigint AS f FROM "Announcement"`);
  const t = Number(r1.rows[0].t), f = Number(r1.rows[0].f);
  console.log(`  Announcement.rawJson opengDt 채움: ${f.toLocaleString()} / ${t.toLocaleString()} (${(f/t*100).toFixed(2)}%)`);

  console.log("\n=== reparse 진행분 BidResult.openedAt 샘플 5건 ===");
  const r2 = await c.query(`SELECT "annId", "openedAt" FROM "BidResult" WHERE "openedAt" IS NOT NULL LIMIT 5`);
  if (r2.rowCount === 0) console.log("  (아직 0건 — reparse 진행 중)");
  for (const row of r2.rows) console.log(`  ${row.annId}: ${row.openedAt}`);

  console.log("\n=== BidResult.openedAt 누적 채움율 ===");
  const r3 = await c.query(`SELECT COUNT(*)::bigint AS t, COUNT(*) FILTER (WHERE "openedAt" IS NOT NULL)::bigint AS f FROM "BidResult"`);
  const t3 = Number(r3.rows[0].t), f3 = Number(r3.rows[0].f);
  console.log(`  ${f3.toLocaleString()} / ${t3.toLocaleString()} (${(f3/t3*100).toFixed(2)}%)`);

  c.release(); await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
