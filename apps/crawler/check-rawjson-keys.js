const { Pool } = require("pg");
const fs = require("fs"), path = require("path");
function getDb() {
  const env = fs.readFileSync(path.resolve(__dirname, "../../.env"), "utf-8");
  for (const l of env.split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "DATABASE_URL" && v && !v.includes("[YOUR-PASSWORD]")) return v;
  }
}
const pool = new Pool({ connectionString: getDb(), max: 2 });
(async () => {
  // category가 '등록공고'인 레코드의 rawJson 키 목록 확인
  const { rows } = await pool.query(`
    SELECT jsonb_object_keys("rawJson") AS key, COUNT(*) AS cnt
    FROM "Announcement"
    WHERE category = '등록공고'
    AND "rawJson" IS NOT NULL
    GROUP BY 1
    HAVING COUNT(*) > 100
    ORDER BY cnt DESC
    LIMIT 30
  `);
  console.log("등록공고 rawJson 키 분포:");
  for (const r of rows) console.log(` ${r.key}: ${r.cnt}건`);

  // pubPrcrmnt 관련 키들의 실제 값 샘플
  const { rows: samples } = await pool.query(`
    SELECT
      "rawJson"->>'pubPrcrmntLrgClsfcNm' AS lrg1,
      "rawJson"->>'pubPrcrmntMidClsfcNm' AS mid1,
      "rawJson"->>'pubPrcrmntLrg' AS lrg2,
      "rawJson"->>'pubPrcrmntMid' AS mid2
    FROM "Announcement"
    WHERE category = '등록공고'
    LIMIT 5
  `);
  console.log("\npubPrcrmnt 필드 값 샘플:");
  for (const r of samples) console.log(r);

  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
