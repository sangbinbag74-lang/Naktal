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

  // 1. BidResult 실제 컬럼
  const cols = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='BidResult' ORDER BY ordinal_position`);
  console.log("BidResult 컬럼:", cols.rows.map((r) => `${r.column_name}(${r.data_type})`).join(", "));

  // 2. 인덱스
  const idx = await c.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename='BidResult'`);
  console.log("\n인덱스:");
  for (const r of idx.rows) console.log(" ", r.indexdef);

  // 3. 규모 + winnerName 커버리지
  const cnt = await c.query(`SELECT COUNT(*)::bigint AS n, COUNT("winnerName")::bigint AS w, COUNT("openedAt")::bigint AS o FROM "BidResult"`);
  console.log(`\n총 ${Number(cnt.rows[0].n).toLocaleString()}건 · winnerName ${Number(cnt.rows[0].w).toLocaleString()}건 · openedAt ${Number(cnt.rows[0].o).toLocaleString()}건`);

  // 4. ilike 검색 성능 실측 (대표 업체명)
  for (const name of ["건설", "종합건설"]) {
    const t0 = Date.now();
    const r = await c.query(
      `SELECT COUNT(*)::bigint AS n FROM "BidResult" WHERE "winnerName" ILIKE $1`,
      [`%${name}%`],
    );
    console.log(`\nILIKE '%${name}%' → ${Number(r.rows[0].n).toLocaleString()}건, ${Date.now() - t0}ms`);
  }

  // 5. 특정 업체 리포트 쿼리 시뮬레이션 (상위 낙찰업체 1곳 추출 후 전체 이력)
  const top = await c.query(`
    SELECT "winnerName", COUNT(*)::bigint AS n FROM "BidResult"
    WHERE "winnerName" IS NOT NULL AND "openedAt" > now() - interval '2 years'
    GROUP BY 1 ORDER BY n DESC LIMIT 5`);
  console.log("\n최근 2년 최다 낙찰 업체 top5:");
  for (const r of top.rows) console.log(`  ${r.winnerName}: ${Number(r.n).toLocaleString()}건`);

  const sample = top.rows[0]?.winnerName;
  if (sample) {
    const t0 = Date.now();
    const rep = await c.query(
      `SELECT "annId","bidRate","finalPrice","numBidders","openedAt" FROM "BidResult"
       WHERE "winnerName" = $1 ORDER BY "openedAt" DESC NULLS LAST LIMIT 2000`,
      [sample],
    );
    console.log(`\n샘플 리포트(정확일치 '${sample}'): ${rep.rows.length}건, ${Date.now() - t0}ms`);
  }

  // 6. Announcement 조인 재료 확인 (bsisAmt/orgName/category/region)
  const ann = await c.query(`SELECT COUNT(*)::bigint AS n FROM "Announcement"`);
  console.log(`\nAnnouncement 총 ${Number(ann.rows[0].n).toLocaleString()}건`);
  const annIdx = await c.query(`SELECT indexdef FROM pg_indexes WHERE tablename='Announcement' AND indexdef ILIKE '%konepsId%'`);
  console.log("Announcement konepsId 인덱스:", annIdx.rows.length > 0 ? "있음" : "없음");
  const orgIdx = await c.query(`SELECT indexdef FROM pg_indexes WHERE tablename='Announcement' AND indexdef ILIKE '%orgName%'`);
  console.log("Announcement orgName 인덱스:", orgIdx.rows.map((r) => r.indexdef).join(" | ") || "없음");

  c.release(); await pool.end();
})();
