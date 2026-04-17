/**
 * ML 학습 데이터 정밀 검증
 *
 * export-training-data.ts 실행 전 데이터 품질을 상세히 확인.
 *
 * 실행: pnpm ts-node src/scripts/verify-ml-data.ts
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

// 학습셋 기본 조인 + 필터 공통 CTE
const BASE_CTE = `
WITH base AS (
  SELECT
    a.category,
    a."orgName",
    a.region,
    a.deadline,
    a."konepsId",
    a.budget::bigint                  AS budget,
    COALESCE(a."aValueAmt"::bigint, 0)  AS a_value_amt,
    COALESCE(a."aValueTotal"::bigint, 0) AS a_value_total,
    b."finalPrice"::bigint            AS final_price,
    b."bidRate"::numeric              AS bid_rate,
    COALESCE(b."numBidders", 0)       AS num_bidders,
    b."winnerName",
    CASE
      WHEN a.budget::bigint < 100000000   THEN '1억미만'
      WHEN a.budget::bigint < 300000000   THEN '1억-3억'
      WHEN a.budget::bigint < 1000000000  THEN '3억-10억'
      WHEN a.budget::bigint < 3000000000  THEN '10억-30억'
      ELSE '30억이상'
    END AS budget_range,
    EXTRACT(YEAR FROM a.deadline)::int  AS year,
    EXTRACT(MONTH FROM a.deadline)::int AS month,
    (b."finalPrice"::numeric / (b."bidRate"::numeric / 100.0)) / a.budget::numeric * 100 AS sajung_rate
  FROM "BidResult" b
  JOIN "Announcement" a ON a."konepsId" = b."annId"
  WHERE b."finalPrice"::bigint > 0
    AND b."bidRate"::numeric > 0
    AND a.budget::bigint > 0
    AND EXTRACT(YEAR FROM a.deadline) BETWEEN 2002 AND 2026
),
base_filtered AS (
  SELECT * FROM base WHERE sajung_rate BETWEEN 97 AND 103
),
with_stat AS (
  SELECT bf.*, s.avg AS stat_avg, s.stddev AS stat_stddev, s.p25, s.p75, s."sampleSize"
  FROM base_filtered bf
  JOIN "SajungRateStat" s ON s."orgName" = bf."orgName"
    AND s.category = bf.category
    AND s."budgetRange" = bf.budget_range
    AND s.region = bf.region
  WHERE s."sampleSize" >= 10
)
`;

async function run(client: any, title: string, sql: string): Promise<void> {
  console.log(`\n━━━ ${title} ━━━`);
  const t0 = Date.now();
  const res = await client.query(BASE_CTE + sql);
  const ms = Date.now() - t0;
  if (res.rows.length === 0) {
    console.log("  (결과 없음)");
    return;
  }
  // 간단 테이블 포맷
  const keys = Object.keys(res.rows[0]);
  console.log(`  ${keys.join(" | ")}`);
  for (const row of res.rows) {
    console.log(`  ${keys.map(k => String(row[k])).join(" | ")}`);
  }
  console.log(`  (${ms}ms, ${res.rows.length}행)`);
}

async function main() {
  const url = loadDatabaseUrl();
  if (!url) { console.error("DATABASE_URL 없음"); process.exit(1); }
  const pool = new Pool({ connectionString: url, max: 2 });
  const client = await pool.connect();

  try {
    console.log("=== ML 학습 데이터 정밀 검증 ===");

    // 1. 단계별 필터 건수
    await run(client, "1. 필터 단계별 건수", `
      SELECT
        (SELECT COUNT(*) FROM base)              AS "0_원본유효",
        (SELECT COUNT(*) FROM base_filtered)     AS "1_사정율97_103",
        (SELECT COUNT(*) FROM with_stat)         AS "2_stat_sample10이상"
    `);

    // 2. 연도별 분포 (최종 학습셋)
    await run(client, "2. 학습셋 연도별 분포", `
      SELECT year, COUNT(*)::int AS cnt,
        ROUND(AVG(sajung_rate)::numeric, 3) AS avg_sajung,
        ROUND(STDDEV(sajung_rate)::numeric, 3) AS stddev
      FROM with_stat
      GROUP BY year ORDER BY year
    `);

    // 3. Split별 건수 (2002~2023 train / 2024 val / 2025~2026 test)
    await run(client, "3. Split별 건수", `
      SELECT
        CASE WHEN year <= 2023 THEN 'train'
             WHEN year = 2024 THEN 'val'
             ELSE 'test' END AS split,
        COUNT(*)::int AS cnt
      FROM with_stat GROUP BY 1 ORDER BY 1
    `);

    // 4. 타겟(사정율) 분포 — 히스토그램
    await run(client, "4. 사정율 타겟 분포 (0.5%p 단위)", `
      SELECT
        FLOOR(sajung_rate * 2) / 2 AS bucket,
        COUNT(*)::int AS cnt,
        ROUND((COUNT(*)::numeric / (SELECT COUNT(*) FROM with_stat) * 100), 2) AS pct
      FROM with_stat
      GROUP BY 1 ORDER BY 1
    `);

    // 5. 타겟 통계
    await run(client, "5. 타겟 통계 (사정율)", `
      SELECT
        ROUND(AVG(sajung_rate)::numeric, 4)     AS mean,
        ROUND(STDDEV(sajung_rate)::numeric, 4)  AS stddev,
        ROUND(MIN(sajung_rate)::numeric, 4)     AS min,
        ROUND(MAX(sajung_rate)::numeric, 4)     AS max,
        ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY sajung_rate)::numeric, 4) AS p25,
        ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY sajung_rate)::numeric, 4) AS p50,
        ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY sajung_rate)::numeric, 4) AS p75
      FROM with_stat
    `);

    // 6. 피처 결측치 점검
    await run(client, "6. 피처 결측/이상 점검", `
      SELECT
        SUM(CASE WHEN category IS NULL OR category = '' THEN 1 ELSE 0 END)::int AS null_category,
        SUM(CASE WHEN "orgName" IS NULL OR "orgName" = '' THEN 1 ELSE 0 END)::int AS null_org,
        SUM(CASE WHEN region IS NULL OR region = '' THEN 1 ELSE 0 END)::int AS null_region,
        SUM(CASE WHEN budget_range IS NULL THEN 1 ELSE 0 END)::int AS null_budget_range,
        SUM(CASE WHEN stat_avg IS NULL THEN 1 ELSE 0 END)::int AS null_stat_avg,
        SUM(CASE WHEN num_bidders < 0 THEN 1 ELSE 0 END)::int AS neg_bidders,
        SUM(CASE WHEN num_bidders = 0 THEN 1 ELSE 0 END)::int AS zero_bidders,
        SUM(CASE WHEN num_bidders > 1000 THEN 1 ELSE 0 END)::int AS extreme_bidders
      FROM with_stat
    `);

    // 7. 수치형 피처 분포
    await run(client, "7. 수치형 피처 기본 통계", `
      SELECT
        'budget'::text AS feature,
        MIN(budget) AS min, MAX(budget) AS max,
        ROUND(AVG(budget)::numeric, 0) AS mean,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY budget)::numeric, 0) AS median
      FROM with_stat
      UNION ALL
      SELECT 'num_bidders',
        MIN(num_bidders)::bigint, MAX(num_bidders)::bigint,
        ROUND(AVG(num_bidders)::numeric, 2)::bigint,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY num_bidders)::bigint
      FROM with_stat
      UNION ALL
      SELECT 'stat_avg',
        MIN(stat_avg)::bigint, MAX(stat_avg)::bigint,
        ROUND(AVG(stat_avg)::numeric, 2)::bigint,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY stat_avg)::bigint
      FROM with_stat
      UNION ALL
      SELECT 'sample_size',
        MIN("sampleSize")::bigint, MAX("sampleSize")::bigint,
        ROUND(AVG("sampleSize")::numeric, 2)::bigint,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "sampleSize")::bigint
      FROM with_stat
    `);

    // 8. 카테고리별 건수 (상위 15)
    await run(client, "8. 카테고리 상위 15", `
      SELECT category, COUNT(*)::int AS cnt
      FROM with_stat GROUP BY 1 ORDER BY 2 DESC LIMIT 15
    `);

    // 9. budgetRange 분포
    await run(client, "9. budgetRange 분포", `
      SELECT budget_range, COUNT(*)::int AS cnt
      FROM with_stat GROUP BY 1 ORDER BY 2 DESC
    `);

    // 10. region 분포 (상위 15)
    await run(client, "10. region 상위 15", `
      SELECT region, COUNT(*)::int AS cnt
      FROM with_stat GROUP BY 1 ORDER BY 2 DESC LIMIT 15
    `);

    // 11. A값 공고 비율
    await run(client, "11. A값 공고 비율", `
      SELECT
        CASE WHEN a_value_amt > 0 THEN 'A값있음' ELSE 'A값없음' END AS type,
        COUNT(*)::int AS cnt,
        ROUND(COUNT(*)::numeric / (SELECT COUNT(*) FROM with_stat) * 100, 2) AS pct
      FROM with_stat GROUP BY 1
    `);

    // 12. sampleSize 분포 (10~30, 30~100, 100+)
    await run(client, "12. SajungRateStat sampleSize 분포", `
      SELECT
        CASE
          WHEN "sampleSize" < 30 THEN '1) 10~29'
          WHEN "sampleSize" < 100 THEN '2) 30~99'
          WHEN "sampleSize" < 500 THEN '3) 100~499'
          ELSE '4) 500+'
        END AS bucket,
        COUNT(*)::int AS cnt,
        ROUND(AVG(sajung_rate)::numeric, 3) AS avg_sajung,
        ROUND(STDDEV(sajung_rate)::numeric, 3) AS stddev
      FROM with_stat GROUP BY 1 ORDER BY 1
    `);

    // 13. 중복 검사 (같은 konepsId가 여러 건?)
    await run(client, "13. 중복 konepsId 체크", `
      SELECT COUNT(*)::int AS "총행수",
        COUNT(DISTINCT "konepsId")::int AS unique_konepsid,
        COUNT(*) - COUNT(DISTINCT "konepsId") AS 중복수
      FROM with_stat
    `);

    // 14. 월별 분포 (계절성 확인)
    await run(client, "14. 월별 분포", `
      SELECT month, COUNT(*)::int AS cnt,
        ROUND(AVG(sajung_rate)::numeric, 3) AS avg_sajung
      FROM with_stat GROUP BY 1 ORDER BY 1
    `);

    // 15. 이상값 점검 — bidRate 극단
    await run(client, "15. bidRate 극단값", `
      SELECT
        MIN(bid_rate) AS min_rate,
        MAX(bid_rate) AS max_rate,
        SUM(CASE WHEN bid_rate < 50 THEN 1 ELSE 0 END)::int AS "50미만",
        SUM(CASE WHEN bid_rate > 100 THEN 1 ELSE 0 END)::int AS "100초과"
      FROM with_stat
    `);

    // 16. A값 공고 공식 검증: (예정가 - A) × 낙찰률 + A ≈ finalPrice 여야 함
    //     사용자 제공 표준 공식대로 backsolve가 일치하는지 샘플 확인
    await run(client, "16. 표준 공식 역산 검증 (샘플)", `
      SELECT
        "konepsId", category, budget, a_value_total,
        ROUND(bid_rate, 3) AS bid_rate,
        final_price,
        ROUND(sajung_rate, 3) AS sajung_rate,
        ROUND((budget * sajung_rate / 100)::numeric, 0) AS predicted_estimated_price,
        ROUND(
          ((budget * sajung_rate / 100) - a_value_total) * (bid_rate / 100) + a_value_total
        , 0) AS predicted_final_price,
        final_price - ROUND(
          ((budget * sajung_rate / 100) - a_value_total) * (bid_rate / 100) + a_value_total
        , 0) AS diff
      FROM with_stat
      WHERE a_value_total > 0
      LIMIT 5
    `);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
