/**
 * /admin/requests 페이지가 보여주는 실제 숫자 정확히 재현
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    // 페이지 상단 5카드와 동일 쿼리
    const a = await p.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN "openingDt" IS NULL THEN 1 END) AS pending_opening_null,
        COUNT(CASE WHEN "isWon" = true THEN 1 END) AS won,
        COUNT(CASE WHEN "isWon" = false THEN 1 END) AS lost,
        COUNT(CASE WHEN "feeStatus" = 'invoiced' THEN 1 END) AS fee_invoiced
      FROM "BidRequest"
    `);
    console.log("=== 페이지 상단 5카드 ===");
    console.log(a.rows[0]);

    // 적중률 통계 (resultDetectedAt 채워진 row)
    const b = await p.query(`
      SELECT
        COUNT(*) AS result_count,
        COUNT(CASE WHEN "isHit" = true THEN 1 END) AS hit_count,
        AVG(ABS("deviationPct"::numeric)) AS avg_deviation,
        COUNT(CASE WHEN "userFollowedRecommendation" = true THEN 1 END) AS follow_count,
        COUNT(CASE WHEN "userFollowedRecommendation" = true AND "isWon" = true THEN 1 END) AS follow_won
      FROM "BidRequest"
      WHERE "resultDetectedAt" IS NOT NULL
    `);
    console.log("\n=== 적중률 3카드 (resultDetectedAt 채워진 row 기준) ===");
    console.log(b.rows[0]);

    // 의뢰 목록 50건 핵심 컬럼
    const c = await p.query(`
      SELECT
        br."id"::text AS id,
        LEFT(br."title", 35) AS title,
        br."deadline",
        br."recommendedBidPrice"::numeric AS rec_price,
        br."userBidPrice"::numeric AS user_bid,
        br."userRank",
        br."userFollowedRecommendation" AS followed,
        br."openingDt",
        br."isWon",
        br."actualFinalPrice"::numeric AS final_price,
        br."actualSajungRate"::numeric AS actual_sj,
        br."predictedSajungRate"::numeric AS pred_sj,
        br."deviationPct"::numeric AS dev,
        br."isHit",
        br."resultDetectedAt",
        br."feeAmount"::numeric AS fee,
        br."feeStatus",
        u."bizName" AS biz_name
      FROM "BidRequest" br
      LEFT JOIN "User" u ON u."id" = br."userId"
      ORDER BY br."recommendedAt" DESC NULLS LAST
      LIMIT 50
    `);
    console.log(`\n=== 의뢰 목록 ${c.rows.length}건 ===`);
    for (const r of c.rows) {
      const won = r.isWon === null ? "?" : r.isWon ? "낙찰" : "미낙";
      const opened = r.openingDt ? "개찰됨" : "개찰안됨";
      console.log(`  [${won}] [${opened}] biz=${(r.biz_name ?? "").slice(0,10).padEnd(10)} rec=${r.rec_price ?? "-"} user_bid=${r.user_bid ?? "-"} rank=${r.userRank ?? "-"} dev=${r.dev ?? "-"} hit=${r.isHit ?? "-"} fee=${r.fee ?? "-"} title=${r.title}`);
    }

    // 결과 처리 누락 진단
    const d = await p.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN "deadline" < NOW() THEN 1 END) AS deadline_passed,
        COUNT(CASE WHEN "deadline" < NOW() AND "isWon" IS NULL THEN 1 END) AS deadline_passed_no_iswon,
        COUNT(CASE WHEN "deadline" < NOW() AND "openingDt" IS NULL THEN 1 END) AS deadline_passed_no_opening,
        COUNT(CASE WHEN "deadline" < NOW() AND "resultDetectedAt" IS NULL THEN 1 END) AS deadline_passed_no_result,
        COUNT(CASE WHEN "deadline" < NOW() AND "userFollowedRecommendation" IS NULL THEN 1 END) AS deadline_passed_no_follow
      FROM "BidRequest"
    `);
    console.log("\n=== 결과 처리 누락 진단 ===");
    console.log(d.rows[0]);
  } catch (e) {
    console.error("ERR:", (e as Error).message);
  } finally {
    await p.end();
    process.exit(0);
  }
})();
