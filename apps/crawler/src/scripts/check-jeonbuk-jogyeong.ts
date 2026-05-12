/** 전북 + 조경식재/시설물공사 활성 공고 직접 SQL count */
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
  // 1. 활성 + 전북
  const r1 = await pool.query(`
    SELECT COUNT(*) FROM "AnnouncementActive" WHERE region = '전북'
  `);
  console.log(`[1] 활성 + 전북: ${r1.rows[0].count}`);

  // 2. 활성 + 전북 + 조경 (category 만)
  const r2 = await pool.query(`
    SELECT COUNT(*) FROM "AnnouncementActive"
    WHERE region = '전북'
      AND category IN ('조경식재공사', '조경시설물공사')
  `);
  console.log(`[2] 활성 + 전북 + category(조경식재 OR 시설물): ${r2.rows[0].count}`);

  // 3. 활성 + 전북 + 조경 (category 또는 subCategories 포함)
  const r3 = await pool.query(`
    SELECT COUNT(*) FROM "AnnouncementActive"
    WHERE region = '전북'
      AND (category IN ('조경식재공사', '조경시설물공사')
           OR "subCategories" && ARRAY['조경식재공사', '조경시설물공사'])
  `);
  console.log(`[3] 활성 + 전북 + category OR subCategories(조경): ${r3.rows[0].count}`);

  // 4. 위 + 수의계약 제외
  const r4 = await pool.query(`
    SELECT COUNT(*) FROM "AnnouncementActive"
    WHERE region = '전북'
      AND (category IN ('조경식재공사', '조경시설물공사')
           OR "subCategories" && ARRAY['조경식재공사', '조경시설물공사'])
      AND ("rawJson"->>'cntrctCnclsMthdNm' IS NULL
           OR "rawJson"->>'cntrctCnclsMthdNm' NOT ILIKE '%수의%')
  `);
  console.log(`[4] 위 + 수의계약 제외: ${r4.rows[0].count}`);

  // 5. 샘플 5건
  const r5 = await pool.query(`
    SELECT "konepsId", title, region, category, "subCategories",
           "rawJson"->>'cntrctCnclsMthdNm' AS cncls
    FROM "AnnouncementActive"
    WHERE region = '전북'
      AND (category IN ('조경식재공사', '조경시설물공사')
           OR "subCategories" && ARRAY['조경식재공사', '조경시설물공사'])
    ORDER BY "createdAt" DESC LIMIT 5
  `);
  console.log("\n[5] 샘플:");
  for (const row of r5.rows) {
    console.log(`  ${row.konepsid} | ${row.region} | cat=${row.category} | sub=${JSON.stringify(row.subcategories)} | cncls=${row.cncls}`);
  }

  await pool.end();
})();
