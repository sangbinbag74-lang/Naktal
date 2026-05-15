// 2026-05-15 사정율 추천 시스템 재설계 — 옛 캐시 (안전 quantile 미적용) 전부 만료
// 새 분석부터 σ × z + Hard clamp 적용된 추천가 사용
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

function loadEnv(p: string) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnv(path.resolve(__dirname, "../../../../.env.local"));
loadEnv(path.resolve(__dirname, "../../../../.env"));
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL 없음");

(async () => {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  try {
    const r1 = await pool.query(`
      UPDATE "BidPricePrediction" SET "expiresAt" = NOW() - interval '1 day'
      WHERE "expiresAt" > NOW()
    `);
    console.log(`BPP 캐시 만료 처리: ${r1.rowCount}건`);

    // 마감 전 BidRequest 중 우리가 하한 아래 추천한 케이스 진단
    const r2 = await pool.query(`
      SELECT br.id, br."konepsId", ann."sucsfbidLwltRate",
        ann."bsisAmt", ann."aValueAmt",
        br."recommendedBidPrice",
        (CASE WHEN ann."bsisAmt" > 0
          THEN ROUND((br."recommendedBidPrice"::numeric / ann."bsisAmt"::numeric) * 100, 3)
          ELSE NULL END) AS rec_rate,
        ann.deadline
      FROM "BidRequest" br
      JOIN "Announcement" ann ON ann."konepsId" = br."konepsId"
      WHERE ann.deadline > NOW()                  -- 마감 전 (재계산 대상)
        AND br."contractAt" IS NULL                -- 미체결 (체결은 잠금)
        AND ann."bsisAmt" > 0
        AND ann."sucsfbidLwltRate" > 0
        AND (br."recommendedBidPrice"::numeric / ann."bsisAmt"::numeric * 100) < ann."sucsfbidLwltRate"
      ORDER BY ann.deadline ASC
    `);
    console.log(`\n[마감 전·미체결·하한 미달 추천 BidRequest: ${r2.rowCount}건]`);
    for (const row of r2.rows) {
      console.log(`  ${row.konepsid} | 하한 ${row.sucsfbidlwltrate}% | 추천 ${row.rec_rate}% | 마감 ${row.deadline}`);
    }
    console.log("\n위 row 들은 사용자가 분석 페이지 재방문 시 새 시스템으로 자동 재계산됨 (BPP 캐시 만료됨).");
  } finally {
    await pool.end();
  }
})();
