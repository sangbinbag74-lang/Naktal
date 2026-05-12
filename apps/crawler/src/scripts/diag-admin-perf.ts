/**
 * 어드민 페이지가 느린 원인 진단 — 페이지별 핵심 쿼리 timing 측정
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

interface QueryTest {
  page: string;
  label: string;
  sql: string;
}

const tests: QueryTest[] = [
  // /admin/accuracy
  { page: "accuracy", label: "AIPrediction limit 2000", sql: `SELECT "annId","isExact","isHit","isNearHit","deviationPct","resultFilledAt" FROM "AIPrediction" LIMIT 2000` },
  { page: "accuracy", label: "Announcement IN 2000개", sql: `SELECT "id","category" FROM "Announcement" WHERE "id" IN (SELECT "annId" FROM "AIPrediction" LIMIT 2000)` },
  { page: "accuracy", label: "AIPrediction recent 30", sql: `SELECT "annId","title","orgName","budget","predictedSajungRate","actualSajungRate","deviationPct","isExact","isHit","isNearHit","predictedAt","resultFilledAt" FROM "AIPrediction" ORDER BY "predictedAt" DESC LIMIT 30` },
  { page: "accuracy", label: "BidPricePrediction limit 300", sql: `SELECT "annId","predictedSajungRate","optimalBidPrice","bidPriceRangeLow","bidPriceRangeHigh","winProbability","sampleSize","expiresAt","createdAt" FROM "BidPricePrediction" ORDER BY "createdAt" DESC LIMIT 300` },
  { page: "accuracy", label: "AIPrediction in BPP annIds", sql: `SELECT "annId","actualSajungRate","actualFinalPrice","deviationPct","isHit" FROM "AIPrediction" WHERE "annId" IN (SELECT "annId" FROM "BidPricePrediction" ORDER BY "createdAt" DESC LIMIT 300)` },
  { page: "accuracy", label: "Announcement bsisAmt in BPP", sql: `SELECT "id","konepsId","bsisAmt","budget","aValueAmt" FROM "Announcement" WHERE "id" IN (SELECT "annId" FROM "BidPricePrediction" ORDER BY "createdAt" DESC LIMIT 300)` },
  { page: "accuracy", label: "BidResult in konepsIds 300개", sql: `SELECT "annId","winnerName","finalPrice","bidRate" FROM "BidResult" WHERE "annId" IN (SELECT "konepsId" FROM "Announcement" WHERE "id" IN (SELECT "annId" FROM "BidPricePrediction" ORDER BY "createdAt" DESC LIMIT 300))` },
  { page: "accuracy", label: "AIPrediction extra resultFilledAt", sql: `SELECT "annId","konepsId","title","orgName","deadline","budget","predictedSajungRate","actualSajungRate","actualFinalPrice","deviationPct","isHit","resultFilledAt" FROM "AIPrediction" WHERE "resultFilledAt" IS NOT NULL ORDER BY "resultFilledAt" DESC LIMIT 500` },
  { page: "accuracy", label: "Announcement count active 공사", sql: `SELECT COUNT(*) FROM "Announcement" WHERE "deadline" > NOW() AND "category" ILIKE '%공사%'` },
  { page: "accuracy", label: "BidPricePrediction count active", sql: `SELECT COUNT(*) FROM "BidPricePrediction" WHERE "expiresAt" > NOW()` },
  { page: "accuracy", label: "SajungRateStat limit 100000", sql: `SELECT "sampleSize","stddev" FROM "SajungRateStat" WHERE "orgName" != 'ALL' LIMIT 100000` },

  // /admin/requests
  { page: "requests", label: "BidRequest count total", sql: `SELECT COUNT(*) FROM "BidRequest"` },
  { page: "requests", label: "BidRequest stats rows", sql: `SELECT "isHit","deviationPct","userFollowedRecommendation","isWon" FROM "BidRequest" WHERE "resultDetectedAt" IS NOT NULL` },
  { page: "requests", label: "BidRequest list 50 wide select", sql: `SELECT "id","title","orgName","deadline","budget","recommendedBidPrice","predictedSajungRate","winProbability","userBidPrice","userBidAt","userFollowedRecommendation","userRank","userBidRate","userDrwtNo1","userDrwtNo2","openingDt","isWon","actualFinalPrice","actualSajungRate","winnerName","totalBidders","feeAmount","feeStatus","agreedFeeRate","agreedFeeAmount","deviationPct","isHit","resultDetectedAt","memo","konepsId","userId","annId","recommendedAt","agreedAt","paidAt","invoicedAt" FROM "BidRequest" ORDER BY "recommendedAt" DESC LIMIT 50` },
];

(async () => {
  const p = new Pool({ connectionString: url, max: 1, statement_timeout: 60000 });
  console.log("=== 어드민 페이지 쿼리 타이밍 ===\n");
  const results: { page: string; label: string; ms: number; rows: number }[] = [];
  for (const t of tests) {
    try {
      const t0 = Date.now();
      const r = await p.query(t.sql);
      const ms = Date.now() - t0;
      results.push({ page: t.page, label: t.label, ms, rows: r.rowCount ?? 0 });
      const tag = ms >= 1000 ? "🔴" : ms >= 300 ? "🟠" : "🟢";
      console.log(`${tag} [${t.page}] ${ms.toString().padStart(5)}ms  rows=${(r.rowCount ?? 0).toString().padStart(6)}  ${t.label}`);
    } catch (e) {
      console.log(`💥 [${t.page}] FAIL ${t.label}: ${(e as Error).message}`);
    }
  }

  console.log("\n=== 페이지별 합계 ===");
  const byPage: Record<string, { total: number; count: number }> = {};
  for (const r of results) {
    if (!byPage[r.page]) byPage[r.page] = { total: 0, count: 0 };
    byPage[r.page].total += r.ms;
    byPage[r.page].count++;
  }
  for (const [page, s] of Object.entries(byPage)) {
    console.log(`  /admin/${page}: ${s.total}ms (쿼리 ${s.count}개, 평균 ${Math.round(s.total / s.count)}ms)`);
  }

  // 인덱스 확인
  console.log("\n=== 핵심 인덱스 존재 여부 ===");
  const idxCheck = await p.query(`
    SELECT t.relname AS tbl, i.relname AS idx, idx.indisunique AS uniq, am.amname AS method,
           pg_get_indexdef(i.oid) AS def
    FROM pg_class t
    JOIN pg_index idx ON idx.indrelid = t.oid
    JOIN pg_class i ON i.oid = idx.indexrelid
    JOIN pg_am am ON am.oid = i.relam
    WHERE t.relname IN ('AIPrediction','BidPricePrediction','BidResult','BidRequest','Announcement','SajungRateStat')
    ORDER BY t.relname, i.relname
  `);
  for (const r of idxCheck.rows) {
    console.log(`  ${r.tbl}.${r.idx} (${r.method}${r.uniq ? ',unique' : ''})`);
  }

  await p.end();
  process.exit(0);
})();
