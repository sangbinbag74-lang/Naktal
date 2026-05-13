/**
 * BidRequest 비정상 사정율 진단
 * - sajungRate 가 95~105% 범위 밖인 row 추출
 * - budget / recommendedBidPrice / estimatedPrice / lowerLimitRate / aValueTotal
 * - 역산 사정율 vs 저장된 사정율 비교
 * - 어디서 INSERT/UPDATE 되었는지 contractAt / recommendedAt / updatedAt
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    const rows = await p.query(`
      SELECT br.id, br."konepsId", br.title, br."orgName",
             br."recommendedBidPrice"::numeric AS price,
             br.budget::numeric AS budget,
             br."estimatedPrice"::numeric AS est_price,
             br."lowerLimitRate"::numeric AS lwlt,
             br."aValueTotal"::numeric AS av,
             br."predictedSajungRate"::numeric AS saved_sajung,
             br."recommendedAt", br."contractAt", br."updatedAt",
             a."bsisAmt"::numeric AS bsis,
             a."aValueAmt"::numeric AS ann_av,
             a.budget::numeric AS ann_budget
      FROM "BidRequest" br
      LEFT JOIN "Announcement" a ON a."konepsId" = br."konepsId"
      WHERE br."predictedSajungRate" IS NOT NULL
        AND (br."predictedSajungRate" < 95 OR br."predictedSajungRate" > 105)
      ORDER BY br."recommendedAt" DESC
    `);

    console.log(`\n=== 비정상 사정율 BidRequest ${rows.rows.length}건 ===\n`);
    for (const r of rows.rows) {
      const price = Number(r.price); const budget = Number(r.budget);
      const lwlt = Number(r.lwlt); const av = Number(r.av);
      const savedSajung = Number(r.saved_sajung);
      // 역산 사정율 (budget 기준)
      const reverseFromBudget = budget > 0 && lwlt > 0
        ? (((price - av) * 100 / lwlt) + av) * 100 / budget
        : 0;
      // 역산 사정율 (bsisAmt 기준)
      const bsis = Number(r.bsis);
      const reverseFromBsis = bsis > 0 && lwlt > 0
        ? (((price - av) * 100 / lwlt) + av) * 100 / bsis
        : 0;
      console.log(`[${r.konepsId}] ${r.title}`);
      console.log(`  orgName: ${r.orgName}`);
      console.log(`  저장 사정율: ${savedSajung.toFixed(3)}%`);
      console.log(`  추천금액: ${price.toLocaleString()}원`);
      console.log(`  BidRequest.budget: ${budget.toLocaleString()}원`);
      console.log(`  Announcement.bsisAmt: ${bsis.toLocaleString()}원`);
      console.log(`  lowerLimitRate: ${lwlt}%, aValueTotal: ${av.toLocaleString()}`);
      console.log(`  역산 사정율 (BidRequest.budget 기준): ${reverseFromBudget.toFixed(3)}%`);
      console.log(`  역산 사정율 (Announcement.bsisAmt 기준): ${reverseFromBsis.toFixed(3)}%`);
      console.log(`  recommendedAt: ${r.recommendedAt}`);
      console.log(`  contractAt: ${r.contractAt}`);
      console.log(`  updatedAt: ${r.updatedAt}`);
      console.log("");
    }

    // BidPricePrediction 캐시도 비정상값 있는지 확인
    const pred = await p.query(`
      SELECT "annId", "predictedSajungRate"::numeric AS rate, "sampleSize",
             "expiresAt", "updatedAt"
      FROM "BidPricePrediction"
      WHERE "predictedSajungRate" < 95 OR "predictedSajungRate" > 105
      ORDER BY "updatedAt" DESC
      LIMIT 20
    `);
    console.log(`\n=== BidPricePrediction 캐시 비정상 ${pred.rows.length}건 ===`);
    for (const r of pred.rows) {
      console.log(`  ${r.annId}: ${Number(r.rate).toFixed(3)}% (sample=${r.sampleSize}, expires=${r.expiresAt})`);
    }
  } catch (e) {
    console.error("ERR:", (e as Error).message);
    process.exit(1);
  } finally {
    await p.end();
    process.exit(0);
  }
})();
