/** 봉화군 SajungRateStat 부모 확장 검증 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const envPath = path.join(__dirname, "..", "..", "..", "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const [k, ...rest] = line.split("=");
    if (k && rest.length > 0 && !process.env[k.trim()]) {
      process.env[k.trim()] = rest.join("=").trim().replace(/^"|"$/g, "");
    }
  }
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL });

(async () => {
  // 1. 정확 매칭 — 0건 확인
  const r1 = await pool.query(`
    SELECT * FROM "SajungRateStat"
    WHERE "orgName" = '경상북도 봉화군 체육시설사업소'
      AND category = '토목공사'
      AND "budgetRange" = '10억-30억'
      AND region = '경북'
  `);
  console.log(`[1] 발주처 정확 매칭 (체육시설사업소 + 토목 + 10억-30억 + 경북): ${r1.rows.length}건`);

  // 2. 부모 ILIKE 매칭 — '경상북도 봉화군%'
  const r2 = await pool.query(`
    SELECT "orgName", "category", "budgetRange", region,
           "sampleSize" AS samplesize, avg, p25, p75
    FROM "SajungRateStat"
    WHERE "orgName" ILIKE '경상북도 봉화군%'
      AND category = '토목공사'
      AND "budgetRange" = '10억-30억'
      AND region = '경북'
    ORDER BY "sampleSize" DESC
  `);
  console.log(`\n[2] 부모 ILIKE '경상북도 봉화군%' + 토목 + 10억-30억 + 경북: ${r2.rows.length}건`);
  let total = 0, weighted = 0;
  for (const row of r2.rows) {
    console.log(`  ${row.orgName} | n=${row.samplesize} avg=${row.avg} p25=${row.p25} p75=${row.p75}`);
    total += Number(row.samplesize ?? 0);
    weighted += Number(row.avg) * Number(row.samplesize ?? 0);
  }
  if (total > 0) {
    console.log(`  → 가중평균 sampleSize=${total}, avg=${(weighted / total).toFixed(3)}%`);
  }

  // 3. region="" 으로 확장
  const r3 = await pool.query(`
    SELECT "orgName", "sampleSize", avg
    FROM "SajungRateStat"
    WHERE "orgName" ILIKE '경상북도 봉화군%'
      AND category = '토목공사'
      AND "budgetRange" = '10억-30억'
      AND region = ''
    ORDER BY "sampleSize" DESC
  `);
  console.log(`\n[3] 동일 + region 빈값: ${r3.rows.length}건`);
  let t3 = 0, w3 = 0;
  for (const row of r3.rows) {
    console.log(`  ${row.orgName} | n=${row.samplesize} avg=${row.avg}`);
    t3 += Number(row.samplesize ?? 0);
    w3 += Number(row.avg) * Number(row.samplesize ?? 0);
  }
  if (t3 > 0) console.log(`  → 가중평균 n=${t3}, avg=${(w3/t3).toFixed(3)}%`);

  // 4. 모든 봉화군 산하 기관 list (어느 기관들 있는지)
  const r4 = await pool.query(`
    SELECT DISTINCT "orgName"
    FROM "SajungRateStat"
    WHERE "orgName" ILIKE '경상북도 봉화군%'
    ORDER BY "orgName"
    LIMIT 20
  `);
  console.log(`\n[4] '경상북도 봉화군%' 모든 SajungRateStat row 의 orgName (전 카테고리): ${r4.rows.length}개`);
  for (const row of r4.rows) console.log(`  ${row.orgName}`);

  // 5. 다른 budgetRange 도 확인 (10억-30억이 0건일 수 있으니)
  const r5 = await pool.query(`
    SELECT "budgetRange", region, SUM("sampleSize") AS total
    FROM "SajungRateStat"
    WHERE "orgName" ILIKE '경상북도 봉화군%'
      AND category = '토목공사'
    GROUP BY "budgetRange", region
    ORDER BY total DESC
  `);
  console.log(`\n[5] '봉화군%' + 토목 — budgetRange/region 별 합계:`);
  for (const row of r5.rows) {
    console.log(`  budgetRange=${row.budgetrange}, region=${row.region}, total=${row.total}`);
  }

  await pool.end();
})();
