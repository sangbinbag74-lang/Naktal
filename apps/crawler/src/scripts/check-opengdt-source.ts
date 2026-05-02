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
  const pool = new Pool({ connectionString: loadDb(), max: 1, statement_timeout: 300000 });
  const c = await pool.connect();

  console.log("=== BidResult.openedAt 현황 ===");
  const r0 = await c.query(`SELECT COUNT(*)::bigint AS total, COUNT(*) FILTER (WHERE "openedAt" IS NOT NULL)::bigint AS filled FROM "BidResult"`);
  const t0 = Number(r0.rows[0].total), f0 = Number(r0.rows[0].filled);
  console.log(`  total: ${t0.toLocaleString()}, openedAt 채움: ${f0.toLocaleString()} (${(f0/t0*100).toFixed(1)}%)`);

  console.log("\n=== Announcement.rawJson 'opengDt' 존재율 (TABLESAMPLE 0.5%) ===");
  const r1 = await c.query(`
    WITH s AS (SELECT "rawJson" FROM "Announcement" TABLESAMPLE SYSTEM(0.5))
    SELECT COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "rawJson" ? 'opengDt')::bigint AS k,
      COUNT(*) FILTER (WHERE NULLIF("rawJson"->>'opengDt','') IS NOT NULL)::bigint AS v
    FROM s
  `);
  const x = r1.rows[0]; const t1 = Number(x.total);
  console.log(`  표본 ${t1.toLocaleString()}건`);
  console.log(`  키 'opengDt'           : ${Number(x.k).toLocaleString()} (${(Number(x.k)/t1*100).toFixed(1)}%)`);
  console.log(`  비-빈 값 'opengDt'     : ${Number(x.v).toLocaleString()} (${(Number(x.v)/t1*100).toFixed(1)}%)`);

  console.log("\n=== BidResult.annId ↔ Announcement.konepsId 조인 가능성 ===");
  const r2 = await c.query(`
    SELECT COUNT(*)::bigint AS br_total,
      (SELECT COUNT(*)::bigint FROM "BidResult" br WHERE EXISTS (SELECT 1 FROM "Announcement" a WHERE a."konepsId" = br."annId")) AS joinable
    FROM "BidResult"
  `);
  const r2r = r2.rows[0]; const tBr = Number(r2r.br_total), jB = Number(r2r.joinable);
  console.log(`  BidResult 전체: ${tBr.toLocaleString()}`);
  console.log(`  Announcement 매칭: ${jB.toLocaleString()} (${(jB/tBr*100).toFixed(1)}%)`);

  console.log("\n=== 매칭된 Announcement 의 rawJson 'opengDt' 비-빈 비율 (전수, 5분 timeout) ===");
  const r3 = await c.query(`
    SELECT
      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Announcement" a WHERE a."konepsId" = br."annId" AND NULLIF(a."rawJson"->>'opengDt','') IS NOT NULL))::bigint AS reparseable,
      COUNT(*)::bigint AS total
    FROM "BidResult" br
    WHERE br."openedAt" IS NULL
  `);
  const r3r = r3.rows[0]; const rep = Number(r3r.reparseable), t3 = Number(r3r.total);
  console.log(`  openedAt NULL 인 BidResult: ${t3.toLocaleString()}`);
  console.log(`  rawJson 에서 reparse 가능: ${rep.toLocaleString()} (${(rep/t3*100).toFixed(1)}%)`);

  console.log("\n=== opengDt 샘플 5건 (형식 확인) ===");
  const r4 = await c.query(`
    SELECT a."konepsId", a."rawJson"->>'opengDt' AS opengDt
    FROM "Announcement" a
    WHERE NULLIF(a."rawJson"->>'opengDt','') IS NOT NULL
    LIMIT 5
  `);
  for (const row of r4.rows) console.log(`  ${row.konepsId}: "${row.opengdt}"`);

  c.release(); await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
