const { Pool } = require("pg");
const fs = require("fs"), path = require("path");

function getDb() {
  const env = fs.readFileSync(path.resolve(__dirname, "../../.env"), "utf-8");
  for (const l of env.split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "DATABASE_URL" && v && !v.includes("[YOUR-PASSWORD]")) return v;
  }
}

const pool = new Pool({ connectionString: getDb(), max: 2 });

(async () => {
  const { rows } = await pool.query(`
    SELECT
      TO_CHAR(DATE_TRUNC('month', b."createdAt"), 'YYYY-MM') AS month,
      COUNT(*) AS cnt
    FROM "BidResult" b
    WHERE b."createdAt" >= '2024-08-01'
    GROUP BY 1
    ORDER BY 1
  `);
  console.log("BidResult 월별 현황 (2024-08~):");
  let total = 0;
  for (const r of rows) {
    console.log(` ${r.month}: ${r.cnt}건`);
    total += parseInt(r.cnt);
  }
  console.log(`소계: ${total}건`);

  const { rows: [all] } = await pool.query('SELECT COUNT(*) AS cnt FROM "BidResult"');
  console.log(`전체 BidResult: ${all.cnt}건`);

  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
