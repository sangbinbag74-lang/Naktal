/**
 * 베타 분석 데이터 초기화 (1회성).
 *
 * 1. BidPricePrediction — 전체 DELETE (24h 캐시, 다음 사용자 진입 시 자동 재생성 = 부모 확장 적용)
 * 2. BidRequest — 잘못된 fallback row (sampleSize=0 / 가격 == 낙찰하한가 / predicted 100/103.8) 분석 필드 NULL
 *    · contractAt 보존 (계약 이력 변경 X)
 *    · 사용자 재진입 시 AutoAnalysisTrigger 가 자동 재분석
 *
 * 실행: npx ts-node src/scripts/reset-beta-analysis.ts
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const envPath = path.join(__dirname, "..", "..", "..", "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const [k, ...rest] = line.split("=");
    if (k && rest.length > 0 && !process.env[k.trim()]) {
      process.env[k.trim()] = rest.join("=").trim().replace(/^"|"$/g, "");
    }
  }
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL });

(async () => {
  console.log("=".repeat(60));
  console.log("베타 분석 데이터 초기화 시작");
  console.log("=".repeat(60));

  // 1. BidPricePrediction 전체 삭제
  const bpp = await pool.query(`DELETE FROM "BidPricePrediction" RETURNING "annId"`);
  console.log(`\n[1] BidPricePrediction 삭제: ${bpp.rowCount}건`);
  console.log("    → 사용자 재진입 시 자동 재분석 (부모 시·군 확장 적용)");

  // 2. BidRequest 잘못된 fallback row 삭제 (베타 — NOT NULL 제약으로 UPDATE NULL 불가)
  //    조건: recommendedBidPrice == lowerLimitPrice (안전마진 0) 또는 predicted 100/103.8 (fallback default)
  const br = await pool.query(`
    DELETE FROM "BidRequest"
    WHERE
      "cancelledAt" IS NULL
      AND (
        "recommendedBidPrice" = "lowerLimitPrice"     -- 잘못된 fallback (가격 동일, 안전마진 0)
        OR "predictedSajungRate" IN (100, 103.8)      -- 카테고리 default 또는 옛 하드코딩
      )
    RETURNING id, "annId", "title", "predictedSajungRate"
  `);
  console.log(`\n[2] BidRequest 잘못된 fallback row 삭제: ${br.rowCount}건`);
  for (const row of br.rows.slice(0, 10)) {
    console.log(`    - ${row.annid} | ${row.title} | predicted=${row.predictedsajungrate}`);
  }
  console.log("    → 사용자 다시 의뢰 시 부모 시·군 확장 적용된 새 분석값 적용");

  // 3. SajungAnalysisCache 도 일괄 삭제 — 사정율 분석 (분포·흐름·구간추천) 즉시 갱신
  const cache = await pool.query(`DELETE FROM "SajungAnalysisCache" RETURNING id`);
  console.log(`\n[3] SajungAnalysisCache 삭제: ${cache.rowCount}건 (사정율 분포·흐름·구간추천 즉시 갱신)`);

  console.log("\n" + "=".repeat(60));
  console.log("✅ 초기화 완료. 사용자 재진입 시 모든 분석 새로 계산됨.");
  console.log("=".repeat(60));

  await pool.end();
})();
