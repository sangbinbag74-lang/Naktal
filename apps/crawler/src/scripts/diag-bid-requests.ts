/**
 * BidRequest 실측 — 사용자가 의뢰한 공고 분석 상태 확인
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    // 1. BidRequest 전체 상태
    const a = await p.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN "isWon" IS NULL THEN 1 END) AS pending,
        COUNT(CASE WHEN "isWon" = true THEN 1 END) AS won,
        COUNT(CASE WHEN "isWon" = false THEN 1 END) AS lost,
        COUNT(CASE WHEN "deadline" < NOW() AND "isWon" IS NULL THEN 1 END) AS deadline_passed_pending,
        COUNT(CASE WHEN "deadline" > NOW() THEN 1 END) AS active
      FROM "BidRequest"
    `);
    console.log("=== BidRequest 전체 상태 ===");
    console.log(a.rows[0]);

    // 2. 모든 BidRequest 상세 (최대 30건)
    const b = await p.query(`
      SELECT
        br."id", br."konepsId", br."deadline", br."isWon",
        br."recommendedBidPrice", br."predictedSajungRate",
        br."actualSajungRate", br."actualFinalPrice",
        br."deviationPct", br."isHit", br."resultDetectedAt",
        u."bizName" AS user_biz,
        a."title", a."bsisAmt",
        bres."annId" AS bidresult_exists,
        bres."finalPrice" AS br_final,
        bres."bidRate" AS br_rate,
        bres."winnerName" AS br_winner
      FROM "BidRequest" br
      LEFT JOIN "User" u ON u."id" = br."userId"
      LEFT JOIN "Announcement" a ON a."konepsId" = br."konepsId"
      LEFT JOIN "BidResult" bres ON bres."annId" = br."konepsId"
      ORDER BY br."deadline" DESC
      LIMIT 30
    `);
    console.log("\n=== BidRequest 최근 30건 ===");
    for (const r of b.rows) {
      const dPassed = r.deadline && new Date(r.deadline) < new Date() ? "마감지남" : "마감전 ";
      const wonLabel = r.isWon === null ? "미입력 " : r.isWon ? "낙찰   " : "미낙찰";
      const brExist = r.bidresult_exists ? "BR있음" : "BR없음";
      console.log(`  [${dPassed}] [${wonLabel}] [${brExist}] koneps=${r.konepsId} biz=${(r.user_biz ?? "").slice(0,15)} title=${(r.title ?? "").slice(0, 30)}`);
    }

    // 3. BidPricePrediction (분석된 공고)
    const c = await p.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN "expiresAt" > NOW() THEN 1 END) AS active,
        COUNT(CASE WHEN "expiresAt" < NOW() THEN 1 END) AS expired,
        MIN("createdAt") AS oldest,
        MAX("createdAt") AS latest
      FROM "BidPricePrediction"
    `);
    console.log("\n=== BidPricePrediction 상태 ===");
    console.log(c.rows[0]);

    // 4. AIPrediction 상태
    const d = await p.query(`
      SELECT
        COUNT(*) AS total,
        COUNT("resultFilledAt") AS filled,
        COUNT(*) - COUNT("resultFilledAt") AS pending,
        SUM(CASE WHEN "isHit" = true THEN 1 ELSE 0 END) AS hit,
        SUM(CASE WHEN "isExact" = true THEN 1 ELSE 0 END) AS exact_hit
      FROM "AIPrediction"
    `);
    console.log("\n=== AIPrediction 상태 ===");
    console.log(d.rows[0]);

    // 5. BidResult 최근 7일 추이
    const e = await p.query(`
      SELECT DATE("createdAt") AS day, COUNT(*) AS n
      FROM "BidResult"
      WHERE "createdAt" > NOW() - INTERVAL '14 days'
      GROUP BY day ORDER BY day DESC
    `);
    console.log("\n=== BidResult 최근 14일 신규 ===");
    for (const r of e.rows) console.log(`  ${r.day.toISOString().slice(0,10)}: ${r.n}건`);
  } catch (e) {
    console.error("ERR:", (e as Error).message);
  } finally {
    await p.end();
    process.exit(0);
  }
})();
