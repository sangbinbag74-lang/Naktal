/**
 * /admin/accuracy 페이지가 현재 보여주는 모든 데이터 정확히 재현
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    // ── KPI 4카드 ──
    const a = await p.query(`
      SELECT
        COUNT(*) AS total_pred,
        COUNT(CASE WHEN "resultFilledAt" IS NOT NULL THEN 1 END) AS evaluated,
        COUNT(CASE WHEN "isHit" = true THEN 1 END) AS hit,
        COUNT(CASE WHEN "isExact" = true THEN 1 END) AS exact_hit,
        COUNT(CASE WHEN "isNearHit" = true THEN 1 END) AS near_hit,
        AVG(CASE WHEN "resultFilledAt" IS NOT NULL THEN ABS("deviationPct"::numeric) END) AS mae
      FROM "AIPrediction"
    `);
    console.log("=== KPI 4카드 ===");
    console.log(a.rows[0]);

    // ── 카테고리별 통계표 ──
    const b = await p.query(`
      SELECT
        COALESCE(ann."category", '기타') AS cat,
        COUNT(*) AS total,
        COUNT(CASE WHEN ap."resultFilledAt" IS NOT NULL THEN 1 END) AS evaluated,
        COUNT(CASE WHEN ap."isExact" = true THEN 1 END) AS exact_count,
        COUNT(CASE WHEN ap."isHit" = true THEN 1 END) AS hit_count,
        COUNT(CASE WHEN ap."isNearHit" = true THEN 1 END) AS near_hit_count,
        AVG(CASE WHEN ap."resultFilledAt" IS NOT NULL THEN ABS(ap."deviationPct"::numeric) END) AS mae
      FROM "AIPrediction" ap
      LEFT JOIN "Announcement" ann ON ann."id" = ap."annId"
      GROUP BY ann."category"
      ORDER BY total DESC
    `);
    console.log("\n=== 카테고리별 통계표 ===");
    for (const r of b.rows) {
      console.log(`  ${r.cat}: total=${r.total} evaluated=${r.evaluated} hit=${r.hit_count} exact=${r.exact_count} near=${r.near_hit_count} mae=${r.mae ? Number(r.mae).toFixed(3) : "-"}`);
    }

    // ── AccuracyClient bppList ── (활성 + 결과 완료, expiresAt 필터 없음, limit 300)
    const c = await p.query(`
      SELECT
        bpp."annId",
        bpp."predictedSajungRate"::numeric AS predicted,
        bpp."optimalBidPrice"::numeric AS optimal,
        bpp."winProbability",
        bpp."sampleSize",
        bpp."expiresAt",
        bpp."createdAt",
        ann."title", ann."orgName", ann."deadline", ann."budget"::numeric AS budget, ann."category", ann."konepsId",
        ap."actualSajungRate"::numeric AS actual,
        ap."deviationPct"::numeric AS dev,
        ap."isHit"
      FROM "BidPricePrediction" bpp
      LEFT JOIN "Announcement" ann ON ann."id" = bpp."annId"
      LEFT JOIN "AIPrediction" ap ON ap."annId" = bpp."annId"
      ORDER BY bpp."createdAt" DESC
      LIMIT 300
    `);
    const total = c.rows.length;
    const withResult = c.rows.filter(r => r.actual != null).length;
    const expiredActive = c.rows.filter(r => new Date(r.expiresAt) > new Date()).length;
    console.log(`\n=== AccuracyClient 표 (BidPricePrediction limit 300) ===`);
    console.log(`  전체 ${total} / 결과 채워짐 ${withResult} / 활성(expiresAt>now) ${expiredActive}`);
    // 결과 채워진 상위 10건
    console.log("\n  결과 채워진 상위 10건:");
    for (const r of c.rows.filter(r => r.actual != null).slice(0, 10)) {
      console.log(`    pred=${Number(r.predicted).toFixed(2)}% actual=${Number(r.actual).toFixed(2)}% dev=${Number(r.dev ?? 0).toFixed(3)}%p hit=${r.isHit} title=${(r.title ?? "").slice(0,40)}`);
    }

    // ── 활성 공사 공고 수 / BPP 활성 ──
    const d = await p.query(`
      SELECT
        (SELECT COUNT(*) FROM "Announcement" WHERE "deadline" > NOW() AND "category" ILIKE '%공사%') AS active_construction,
        (SELECT COUNT(*) FROM "BidPricePrediction" WHERE "expiresAt" > NOW()) AS active_pred
    `);
    console.log("\n=== 공고 수 ===");
    console.log(d.rows[0]);

    // ── SajungRateStat 신뢰도 분포 ──
    const e = await p.query(`
      SELECT
        COUNT(CASE WHEN "sampleSize" >= 15 AND "stddev" <= 2.0 THEN 1 END) AS high,
        COUNT(CASE WHEN "sampleSize" >= 5 AND "stddev" <= 3.0 AND NOT ("sampleSize" >= 15 AND "stddev" <= 2.0) THEN 1 END) AS medium,
        COUNT(CASE WHEN NOT ("sampleSize" >= 5 AND "stddev" <= 3.0) THEN 1 END) AS low,
        COUNT(*) AS total
      FROM "SajungRateStat"
      WHERE "orgName" != 'ALL'
    `);
    console.log("\n=== SajungRateStat 신뢰도 ===");
    console.log(e.rows[0]);
  } catch (e) {
    console.error("ERR:", (e as Error).message);
    process.exit(1);
  } finally {
    await p.end();
    process.exit(0);
  }
})();
