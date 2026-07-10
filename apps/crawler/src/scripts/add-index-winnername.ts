/**
 * BidResult.winnerName trigram GIN 인덱스 (경쟁사 리포트용, 2026-07-10)
 *  - Announcement.orgName 과 동일 패턴 (pg_trgm 이미 활성)
 *  - CONCURRENTLY: 무중단 · additive (데이터 변경 없음)
 *  - 목적: /api/competitors/report ILIKE 검색 9초 → ms 급
 */
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
  await c.query(`SET statement_timeout = 0`);

  const ext = await c.query(`SELECT 1 FROM pg_extension WHERE extname='pg_trgm'`);
  console.log("pg_trgm:", ext.rows.length > 0 ? "활성" : "없음(생성 시도)");
  if (ext.rows.length === 0) await c.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

  const exists = await c.query(`SELECT 1 FROM pg_indexes WHERE tablename='BidResult' AND indexname='br_winnername_trgm_idx'`);
  if (exists.rows.length > 0) {
    console.log("br_winnername_trgm_idx 이미 존재 — skip");
  } else {
    console.log("CREATE INDEX CONCURRENTLY 시작 (520만행, 수 분 소요)...");
    const t0 = Date.now();
    await c.query(`CREATE INDEX CONCURRENTLY br_winnername_trgm_idx ON "BidResult" USING gin ("winnerName" gin_trgm_ops)`);
    console.log(`완료: ${Math.round((Date.now() - t0) / 1000)}초`);
  }

  // 검증: 인덱스 사용 + 속도 실측
  for (const q of ["디비손해보험", "종합건설"]) {
    const t0 = Date.now();
    const r = await c.query(`SELECT COUNT(*)::bigint AS n FROM "BidResult" WHERE "winnerName" ILIKE $1`, [`%${q}%`]);
    console.log(`ILIKE '%${q}%' → ${Number(r.rows[0].n).toLocaleString()}건, ${Date.now() - t0}ms`);
  }
  const plan = await c.query(`EXPLAIN SELECT * FROM "BidResult" WHERE "winnerName" ILIKE '%디비손해보험%' LIMIT 100`);
  console.log("\n플랜:"); for (const r of plan.rows) console.log(" ", r["QUERY PLAN"]);

  c.release(); await pool.end();
})();
