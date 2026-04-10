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
  const { rows } = await pool.query(`
    SELECT category, COUNT(*) AS cnt FROM "Announcement"
    WHERE category IN ('용역', '시설공사', '물품', '기술용역', '토목공사', '건축공사')
    GROUP BY category ORDER BY cnt DESC
  `);
  console.log("주요 업무 카테고리:");
  for (const r of rows) console.log(` ${r.category}: ${r.cnt}건`);

  // 신규 추가된 공고(2025-03~04)의 category 샘플
  const { rows: r2 } = await pool.query(`
    SELECT category, COUNT(*) AS cnt FROM "Announcement"
    WHERE "createdAt" >= '2026-04-04'
    GROUP BY category ORDER BY cnt DESC LIMIT 10
  `);
  console.log("\n오늘 추가된 공고 category 분포:");
  for (const r of r2) console.log(` ${r.category}: ${r.cnt}건`);

  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
