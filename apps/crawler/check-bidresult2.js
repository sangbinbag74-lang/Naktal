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
  // BidResult.annId = Announcement.konepsId (raw 공고번호)
  const { rows } = await pool.query(`
    SELECT
      TO_CHAR(DATE_TRUNC('month', a.deadline), 'YYYY-MM') AS month,
      COUNT(*) AS cnt
    FROM "BidResult" b
    JOIN "Announcement" a ON a."konepsId" = b."annId"
    WHERE a.deadline >= '2024-08-01'
    GROUP BY 1
    ORDER BY 1
  `);
  console.log("낙찰결과 (Announcement 마감일 기준, 2024-08~):");
  let total = 0;
  for (const r of rows) {
    console.log(` ${r.month}: ${r.cnt}건`);
    total += parseInt(r.cnt);
  }
  console.log(`소계: ${total}건`);

  // 매칭 안 되는 BidResult 수 (Announcement 없는 경우)
  const { rows: [unmatched] } = await pool.query(`
    SELECT COUNT(*) AS cnt FROM "BidResult" b
    LEFT JOIN "Announcement" a ON a."konepsId" = b."annId"
    WHERE a.id IS NULL
    LIMIT 1
  `);
  console.log(`Announcement 없는 BidResult: ${unmatched.cnt}건`);

  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
