/** prtcptnLmtNm (참여 제한 지역) 실제 데이터 형식 분석 */
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
  // 활성 공고에서 prtcptnLmtNm 빈도 분석
  const r = await pool.query(`
    SELECT
      "rawJson"->>'prtcptnLmtNm' AS lmt,
      COUNT(*) AS cnt
    FROM "AnnouncementActive"
    WHERE "rawJson"->>'prtcptnLmtNm' IS NOT NULL
      AND "rawJson"->>'prtcptnLmtNm' != ''
    GROUP BY "rawJson"->>'prtcptnLmtNm'
    ORDER BY cnt DESC
    LIMIT 30
  `);
  console.log("=== TOP 30 unique prtcptnLmtNm (활성 공고) ===");
  for (const row of r.rows) {
    console.log(`  ${row.cnt.toString().padStart(5)} : ${row.lmt}`);
  }

  // 빈값 / NULL 비율
  const r2 = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE "rawJson"->>'prtcptnLmtNm' IS NULL OR "rawJson"->>'prtcptnLmtNm' = '') AS empty_cnt,
      COUNT(*) AS total
    FROM "AnnouncementActive"
  `);
  console.log(`\n빈값/NULL: ${r2.rows[0].empty_cnt}/${r2.rows[0].total}`);

  await pool.end();
})();
