/**
 * BidRequest.userFollowedRecommendation 백필
 * - userBidPrice 와 recommendedBidPrice 차이 ±0.5% 이내 = 추천 따름
 * - 기존 NULL row 일괄 채움
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    // 1. 후보 row
    const rows = await p.query(`
      SELECT "id", "recommendedBidPrice"::numeric AS rec, "userBidPrice"::numeric AS user_bid
      FROM "BidRequest"
      WHERE "userFollowedRecommendation" IS NULL
        AND "userBidPrice" IS NOT NULL
        AND "recommendedBidPrice" IS NOT NULL
        AND "recommendedBidPrice"::numeric > 0
    `);
    console.log(`후보 row: ${rows.rows.length}`);

    let followed = 0;
    let notFollowed = 0;
    for (const r of rows.rows) {
      const rec = Number(r.rec);
      const ub = Number(r.user_bid);
      if (rec <= 0) continue;
      const diff = Math.abs(ub - rec) / rec;
      const isFollowed = diff <= 0.005;
      await p.query(`UPDATE "BidRequest" SET "userFollowedRecommendation" = $1 WHERE "id" = $2`, [isFollowed, r.id]);
      if (isFollowed) followed++; else notFollowed++;
      console.log(`  ${isFollowed ? "✓" : "✗"} rec=${rec} user=${ub} diff=${(diff * 100).toFixed(3)}%`);
    }
    console.log(`\n결과: 추천 따름 ${followed} / 안 따름 ${notFollowed}`);
  } catch (e) {
    console.error("ERR:", (e as Error).message);
    process.exit(1);
  } finally {
    await p.end();
    process.exit(0);
  }
})();
