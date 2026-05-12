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
const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
const pool = new Pool({ connectionString: url });

(async () => {
  // rawJson 의 모든 키 중 region/prtcpt/Rgn/지역 관련 키 + 빈도
  const r = await pool.query(`
    SELECT key, COUNT(*) AS cnt
    FROM (
      SELECT jsonb_object_keys("rawJson"::jsonb) AS key
      FROM "AnnouncementActive"
      LIMIT 1000
    ) k
    WHERE key ILIKE '%rgn%' OR key ILIKE '%prtcpt%' OR key ILIKE '%region%' OR key ILIKE '%지역%' OR key ILIKE '%duty%' OR key ILIKE '%cibl%'
    GROUP BY key
    ORDER BY cnt DESC
    LIMIT 30
  `);
  console.log("=== rawJson 의 region/참여 관련 키 ===");
  for (const row of r.rows) {
    console.log(`  ${row.cnt.toString().padStart(5)} : ${row.key}`);
  }

  // 지역제한 채워진 공고 샘플
  console.log("\n=== 지역제한 있는 공고 (rgnLmtBidLocplcJdgmBssNm 채움) ===");
  const sample = await pool.query(`
    SELECT
      "konepsId",
      "title",
      "region" AS ann_region,
      "rawJson"->>'rgnLmtBidLocplcJdgmBssNm' AS rgn_lmt_nm,
      "rawJson"->>'rgnLmtBidLocplcJdgmBssCd' AS rgn_lmt_cd,
      "rawJson"->>'bidPrtcptLmtYn' AS lmt_yn,
      "rawJson"->>'jntcontrctDutyRgnNm1' AS jnt_rgn1,
      "rawJson"->>'jntcontrctDutyRgnNm2' AS jnt_rgn2,
      "rawJson"->>'rgnDutyJntcontrctYn' AS rgn_duty_yn,
      "rawJson"->>'rgnDutyJntcontrctRt' AS rgn_duty_rt
    FROM "AnnouncementActive"
    WHERE "rawJson"->>'rgnLmtBidLocplcJdgmBssNm' IS NOT NULL
       OR "rawJson"->>'jntcontrctDutyRgnNm1' IS NOT NULL
    LIMIT 10
  `);
  for (const row of sample.rows) {
    console.log("  ---");
    console.log(`  konepsId      = ${row.konepsid}`);
    console.log(`  title         = ${(row.title ?? "").slice(0, 60)}`);
    console.log(`  ann_region    = ${row.ann_region}`);
    console.log(`  rgnLmt 판정명 = ${row.rgn_lmt_nm}`);
    console.log(`  rgnLmt 판정코드= ${row.rgn_lmt_cd}`);
    console.log(`  bidPrtcptLmtYn= ${row.lmt_yn}`);
    console.log(`  jnt_rgn1      = ${row.jnt_rgn1}`);
    console.log(`  jnt_rgn2      = ${row.jnt_rgn2}`);
    console.log(`  rgnDutyYn/Rt  = ${row.rgn_duty_yn} / ${row.rgn_duty_rt}`);
  }

  // bidPrtcptLmtYn=Y 인 row 만 — 실제 지역제한 정보
  const r4 = await pool.query(`
    SELECT
      "konepsId", "title", "region",
      "rawJson"->>'rgnLmtBidLocplcJdgmBssNm' AS rgn_lmt_nm,
      "rawJson"->>'jntcontrctDutyRgnNm1' AS jnt1,
      "rawJson"->>'jntcontrctDutyRgnNm2' AS jnt2,
      "rawJson"->>'jntcontrctDutyRgnNm3' AS jnt3
    FROM "AnnouncementActive"
    WHERE "rawJson"->>'bidPrtcptLmtYn' = 'Y'
    LIMIT 30
  `);
  console.log("\n=== bidPrtcptLmtYn=Y 인 공고 (실 지역제한) ===");
  for (const row of r4.rows) {
    console.log(`  region=${row.region} / 판정=${row.rgn_lmt_nm} / 공동수급1=${row.jnt1} / 2=${row.jnt2} / 3=${row.jnt3}`);
    console.log(`    title: ${(row.title ?? "").slice(0, 50)}`);
  }

  await pool.end();
})();
