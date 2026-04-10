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
  // 공사 관련 category
  const { rows } = await pool.query(`
    SELECT category, COUNT(*) AS cnt FROM "Announcement"
    WHERE category LIKE '%공사%' OR category LIKE '%토목%' OR category LIKE '%건축%'
    GROUP BY category ORDER BY cnt DESC LIMIT 15
  `);
  console.log("공사 관련 category:");
  for (const r of rows) console.log(` ${r.category}: ${r.cnt}건`);

  // 시설공사 category 샘플 (최근 공고)
  const { rows: samples } = await pool.query(`
    SELECT "konepsId", title, category, deadline::date AS deadline
    FROM "Announcement"
    WHERE category = '시설공사'
    ORDER BY deadline DESC
    LIMIT 5
  `);
  console.log("\n시설공사 최근 공고 샘플:");
  for (const r of samples) console.log(` [${r.deadline}] ${r.title?.slice(0,40)}`);

  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
