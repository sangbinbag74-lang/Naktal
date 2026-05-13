/**
 * 박상빈님 사진의 동신초 외부환경 개선공사 BidRequest 직접 조회
 * konepsId: R26BK01503415
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    const KONEPS = "R26BK01503415";

    // Announcement
    const ann = await p.query(`
      SELECT id, "konepsId", title, "orgName", budget, "bsisAmt", "aValueAmt", "sucsfbidLwltRate", "aValueTotal"
      FROM "Announcement" WHERE "konepsId"=$1
    `, [KONEPS]);
    console.log("\n=== Announcement ===");
    console.log(JSON.stringify(ann.rows[0], (_, v) => typeof v === "bigint" ? v.toString() : v, 2));

    // BidRequest (모든 user, 모든 row)
    const br = await p.query(`
      SELECT br.id, br."userId", u."bizName", u."ownerName",
             br."recommendedBidPrice"::numeric AS price,
             br.budget::numeric AS budget,
             br."estimatedPrice"::numeric AS est_price,
             br."lowerLimitPrice"::numeric AS lower_limit,
             br."lowerLimitRate"::numeric AS lwlt,
             br."aValueTotal"::numeric AS av,
             br."aValueYn",
             br."predictedSajungRate"::numeric AS sajung,
             br."winProbability",
             br."recommendedAt", br."contractAt", br."agreedAt"
      FROM "BidRequest" br
      LEFT JOIN "User" u ON u.id = br."userId"
      WHERE br."konepsId"=$1
      ORDER BY br."recommendedAt" DESC NULLS LAST
    `, [KONEPS]);
    console.log(`\n=== BidRequest ${br.rows.length}건 ===`);
    for (const r of br.rows) {
      const price = Number(r.price); const budget = Number(r.budget);
      const lwlt = Number(r.lwlt); const av = Number(r.av);
      const reverseFromBudget = budget > 0 && lwlt > 0
        ? (((price - av) * 100 / lwlt) + av) * 100 / budget : 0;
      console.log(`---`);
      console.log(`  user: ${r.bizName} (${r.ownerName})`);
      console.log(`  저장 사정율: ${Number(r.sajung).toFixed(3)}%`);
      console.log(`  추천금액: ${price.toLocaleString()}원`);
      console.log(`  budget: ${budget.toLocaleString()}원`);
      console.log(`  예가: ${Number(r.est_price).toLocaleString()}원`);
      console.log(`  낙찰하한가: ${Number(r.lower_limit).toLocaleString()}원`);
      console.log(`  lwlt: ${lwlt}%, A값: ${av.toLocaleString()}, aValueYn: ${r.aValueYn}`);
      console.log(`  budget 기준 역산 사정율: ${reverseFromBudget.toFixed(3)}%`);
      console.log(`  recommendedAt: ${r.recommendedAt}`);
      console.log(`  contractAt: ${r.contractAt}`);
      console.log(`  agreedAt: ${r.agreedAt}`);
    }

    // BidPricePrediction cache
    const annId = ann.rows[0]?.id;
    if (annId) {
      const cache = await p.query(`
        SELECT "annId", "predictedSajungRate"::numeric AS rate, "sampleSize",
               "expiresAt", "createdAt"
        FROM "BidPricePrediction"
        WHERE "annId"=$1
      `, [annId]);
      console.log(`\n=== BidPricePrediction cache (annId=${annId}) ===`);
      for (const r of cache.rows) {
        console.log(`  rate=${Number(r.rate).toFixed(3)}%  sample=${r.sampleSize}  expires=${r.expiresAt}  created=${r.createdAt}`);
      }
    }
  } catch (e) {
    console.error("ERR:", (e as Error).message);
    process.exit(1);
  } finally {
    await p.end();
    process.exit(0);
  }
})();
