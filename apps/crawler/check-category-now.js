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
    GROUP BY category ORDER BY cnt DESC LIMIT 20
  `);
  console.log("현재 category 분포:");
  let total = 0;
  for (const r of rows) { console.log(` ${r.category}: ${r.cnt}건`); total += parseInt(r.cnt); }
  const { rows: [all] } = await pool.query('SELECT COUNT(*) AS cnt FROM "Announcement"');
  console.log(`상위 20개 소계: ${total}건 / 전체: ${all.cnt}건`);
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
