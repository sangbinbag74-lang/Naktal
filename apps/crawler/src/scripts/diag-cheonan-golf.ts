/**
 * 천안상록골프장 R26BK01499800 데이터 부족 원인 진단
 * - BidPricePrediction 캐시 / SajungRateStat / Announcement
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    const KONEPS = "R26BK01499800";

    const ann = await p.query(`
      SELECT id, "konepsId", title, "orgName", category, region, budget, "bsisAmt", "subCategories", "aValueTotal"
      FROM "Announcement" WHERE "konepsId"=$1
    `, [KONEPS]);
    console.log("\n=== Announcement ===");
    const a = ann.rows[0];
    console.log(JSON.stringify(a, (_, v) => typeof v === "bigint" ? v.toString() : v, 2));

    if (!a) { console.log("공고 없음"); process.exit(0); }

    // budgetRange 분류
    const budget = Number(a.budget);
    let br = "30억이상";
    if (budget < 100_000_000) br = "1억미만";
    else if (budget < 300_000_000) br = "1억-3억";
    else if (budget < 1_000_000_000) br = "3억-10억";
    else if (budget < 3_000_000_000) br = "10억-30억";
    console.log(`\nbudgetRange: ${br}`);

    // BidPricePrediction 캐시
    const cache = await p.query(`
      SELECT "predictedSajungRate"::numeric AS rate, "sampleSize", "expiresAt", "createdAt"
      FROM "BidPricePrediction" WHERE "annId"=$1
    `, [a.id]);
    console.log(`\n=== BidPricePrediction 캐시 ===`);
    if (cache.rows.length === 0) console.log("  없음");
    for (const r of cache.rows) {
      console.log(`  rate=${Number(r.rate).toFixed(3)}% sample=${r.sampleSize} expires=${r.expiresAt}`);
    }

    // SajungRateStat — 발주처+업종+예산구간+지역 정확히 일치
    const exact = await p.query(`
      SELECT avg, "sampleSize"
      FROM "SajungRateStat"
      WHERE "orgName"=$1 AND category=$2 AND "budgetRange"=$3 AND region=$4
    `, [a.orgName, a.category, br, a.region]);
    console.log(`\n=== SajungRateStat 정확 매칭 (org+cat+br+region) ===`);
    if (exact.rows.length === 0) console.log("  없음 ⚠");
    for (const r of exact.rows) console.log(`  avg=${Number(r.avg).toFixed(3)}% sample=${r.sampleSize}`);

    // SajungRateStat — ALL 폴백
    const allFb = await p.query(`
      SELECT avg, "sampleSize"
      FROM "SajungRateStat"
      WHERE "orgName"='ALL' AND category=$1 AND "budgetRange"=$2 AND region=''
    `, [a.category, br]);
    console.log(`\n=== SajungRateStat ALL 폴백 (cat+br) ===`);
    if (allFb.rows.length === 0) console.log("  없음 ⚠");
    for (const r of allFb.rows) console.log(`  avg=${Number(r.avg).toFixed(3)}% sample=${r.sampleSize}`);

    // 발주처 ILIKE 확장 — 공무원연금공단
    const orgTokens = String(a.orgName).trim().split(/\s+/);
    console.log(`\norgTokens: ${JSON.stringify(orgTokens)}`);
    for (const prefix of orgTokens) {
      const fb = await p.query(`
        SELECT COUNT(*)::int AS cnt, SUM("sampleSize")::int AS total
        FROM "SajungRateStat"
        WHERE "orgName" ILIKE $1 AND category=$2 AND "budgetRange"=$3
      `, [`${prefix}%`, a.category, br]);
      console.log(`  ILIKE '${prefix}%' + cat=${a.category} + br=${br}: rows=${fb.rows[0].cnt}, total=${fb.rows[0].total ?? 0}`);
    }

    // BidResult 자체 — 이 발주처 + 카테고리 입찰 결과 몇 건?
    const br2 = await p.query(`
      SELECT COUNT(*)::int AS cnt
      FROM "BidResult" b
      JOIN "Announcement" ann ON ann."konepsId" = b."annKonepsId"
      WHERE ann."orgName" ILIKE $1 AND ann.category=$2
    `, [`${orgTokens[0]}%`, a.category]);
    console.log(`\nBidResult (org ILIKE + cat): ${br2.rows[0].cnt}건`);

    // 카테고리 전체 (ALL fallback 폴백) — SajungRateStat 전체 카운트
    const catAll = await p.query(`
      SELECT COUNT(*)::int AS cnt, SUM("sampleSize")::int AS total
      FROM "SajungRateStat"
      WHERE category=$1 AND "sampleSize">0
    `, [a.category]);
    console.log(`SajungRateStat (cat=${a.category}) 전체: rows=${catAll.rows[0].cnt}, total=${catAll.rows[0].total ?? 0}`);
  } catch (e) {
    console.error("ERR:", (e as Error).message);
    process.exit(1);
  } finally {
    await p.end();
    process.exit(0);
  }
})();
