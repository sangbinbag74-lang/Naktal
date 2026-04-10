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
    SELECT
      TO_CHAR(DATE_TRUNC('month', deadline), 'YYYY-MM') AS month,
      COUNT(*) AS cnt
    FROM "Announcement"
    WHERE deadline >= '2024-08-01'
    GROUP BY 1 ORDER BY 1
  `);
  console.log("Announcement 마감일 기준 월별 분포 (2024-08~):");
  for (const r of rows) console.log(` ${r.month}: ${r.cnt}건`);
  const { rows: [tot] } = await pool.query('SELECT COUNT(*) AS cnt FROM "Announcement"');
  console.log(`전체 Announcement: ${tot.cnt}건`);
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
