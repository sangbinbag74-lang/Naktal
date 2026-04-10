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
  // 오늘 추가된 '등록공고' 레코드의 pubPrcrmntMidClsfcNm 분포
  const { rows } = await pool.query(`
    SELECT
      "rawJson"->>'pubPrcrmntMidClsfcNm' AS mid,
      "rawJson"->>'pubPrcrmntLrgClsfcNm' AS lrg,
      "rawJson"->>'ntceKindNm' AS kind,
      COUNT(*) AS cnt
    FROM "Announcement"
    WHERE category = '등록공고'
      AND "createdAt" >= '2026-04-04'
    GROUP BY 1, 2, 3
    ORDER BY cnt DESC
    LIMIT 10
  `);
  console.log("오늘 추가된 등록공고 rawJson 분포:");
  for (const r of rows) console.log(` mid="${r.mid}" lrg="${r.lrg}" kind="${r.kind}": ${r.cnt}건`);

  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
