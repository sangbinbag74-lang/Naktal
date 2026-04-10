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
  // srvceDivNm 분포
  const { rows } = await pool.query(`
    SELECT
      "rawJson"->>'srvceDivNm' AS srvceDivNm,
      COUNT(*) AS cnt
    FROM "Announcement"
    WHERE category IN ('등록공고','재공고','취소공고','변경공고')
    GROUP BY 1
    ORDER BY cnt DESC
    LIMIT 15
  `);
  console.log("등록공고 등 rawJson.srvceDivNm 분포:");
  for (const r of rows) console.log(` "${r.srvcedivnm ?? 'null'}": ${r.cnt}건`);

  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
