/**
 * ML 학습용 레코드 수 확인
 *
 * BidResult JOIN Announcement (+ optional SajungRateStat) 후
 * 사정율 97~103% 범위, budget/bidRate/finalPrice 유효한 것들의 건수를 연도/월별로 집계.
 *
 * 실행: pnpm ts-node src/scripts/check-ml-data.ts
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadDatabaseUrl(): string | undefined {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  try {
    const content = fs.readFileSync(rootEnv, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (key === "DATABASE_URL" && val && !val.includes("[YOUR-PASSWORD]")) return val;
    }
  } catch {}
  return process.env.DATABASE_URL;
}

async function main() {
  const url = loadDatabaseUrl();
  if (!url) { console.error("DATABASE_URL 없음"); process.exit(1); }
  const pool = new Pool({ connectionString: url, max: 2 });
  const client = await pool.connect();
  try {
    console.log("=== ML 학습용 데이터 요약 ===\n");

    // 1. 전체 조인 가능 건수
    const total = await client.query(`
      SELECT COUNT(*)::int AS cnt
      FROM "BidResult" b
      JOIN "Announcement" a ON a."konepsId" = b."annId"
      WHERE b."finalPrice"::bigint > 0
        AND b."bidRate"::numeric > 0
        AND a.budget::bigint > 0
    `);
    console.log(`1. BidResult ⋈ Announcement (유효): ${total.rows[0].cnt.toLocaleString()}건`);

    // 2. 사정율 유효범위 필터 후
    const valid = await client.query(`
      SELECT COUNT(*)::int AS cnt
      FROM "BidResult" b
      JOIN "Announcement" a ON a."konepsId" = b."annId"
      WHERE b."finalPrice"::bigint > 0
        AND b."bidRate"::numeric > 0
        AND a.budget::bigint > 0
        AND (b."finalPrice"::bigint / (b."bidRate"::numeric / 100.0)) / a.budget::bigint * 100
          BETWEEN 97 AND 103
    `);
    console.log(`2. 사정율 97~103% 필터: ${valid.rows[0].cnt.toLocaleString()}건`);

    // 3. 연도별 분포
    const byYear = await client.query(`
      SELECT EXTRACT(YEAR FROM a.deadline)::int AS year, COUNT(*)::int AS cnt
      FROM "BidResult" b
      JOIN "Announcement" a ON a."konepsId" = b."annId"
      WHERE b."finalPrice"::bigint > 0
        AND b."bidRate"::numeric > 0
        AND a.budget::bigint > 0
        AND (b."finalPrice"::bigint / (b."bidRate"::numeric / 100.0)) / a.budget::bigint * 100
          BETWEEN 97 AND 103
      GROUP BY 1 ORDER BY 1
    `);
    console.log(`\n3. 연도별 분포:`);
    let trainCnt = 0, valCnt = 0;
    for (const r of byYear.rows) {
      console.log(`  ${r.year}: ${r.cnt.toLocaleString()}건`);
      if (r.year < 2018) trainCnt += r.cnt;
      else valCnt += r.cnt;
    }
    console.log(`\n4. Train (2002~2017): ${trainCnt.toLocaleString()}건`);
    console.log(`   Val   (2018~2019): ${valCnt.toLocaleString()}건`);

    // 4. SajungRateStat 조인 가능 여부 (stat_avg feature용)
    const withStat = await client.query(`
      SELECT COUNT(*)::int AS cnt
      FROM "BidResult" b
      JOIN "Announcement" a ON a."konepsId" = b."annId"
      JOIN "SajungRateStat" s ON s."orgName" = a."orgName"
        AND s.category = a.category
        AND s."budgetRange" = (
          CASE
            WHEN a.budget::bigint < 100000000   THEN '1억미만'
            WHEN a.budget::bigint < 300000000   THEN '1억-3억'
            WHEN a.budget::bigint < 1000000000  THEN '3억-10억'
            WHEN a.budget::bigint < 3000000000  THEN '10억-30억'
            ELSE '30억이상'
          END
        )
        AND s.region = a.region
      WHERE b."finalPrice"::bigint > 0
        AND b."bidRate"::numeric > 0
        AND a.budget::bigint > 0
        AND s."sampleSize" >= 10
        AND (b."finalPrice"::bigint / (b."bidRate"::numeric / 100.0)) / a.budget::bigint * 100
          BETWEEN 97 AND 103
    `);
    console.log(`\n5. SajungRateStat 조인 (sampleSize≥10): ${withStat.rows[0].cnt.toLocaleString()}건`);

    // 5. 카테고리별 상위
    const byCat = await client.query(`
      SELECT a.category, COUNT(*)::int AS cnt
      FROM "BidResult" b
      JOIN "Announcement" a ON a."konepsId" = b."annId"
      WHERE b."finalPrice"::bigint > 0
        AND b."bidRate"::numeric > 0
        AND a.budget::bigint > 0
        AND (b."finalPrice"::bigint / (b."bidRate"::numeric / 100.0)) / a.budget::bigint * 100
          BETWEEN 97 AND 103
      GROUP BY 1 ORDER BY 2 DESC LIMIT 10
    `);
    console.log(`\n6. 카테고리 상위 10:`);
    for (const r of byCat.rows) {
      console.log(`  ${r.category}: ${r.cnt.toLocaleString()}건`);
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
