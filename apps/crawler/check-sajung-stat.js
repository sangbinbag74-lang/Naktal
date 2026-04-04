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
  const { rows: [s] } = await pool.query(`SELECT COUNT(*) AS cnt FROM "SajungRateStat"`);
  console.log("SajungRateStat 레코드 수:", s.cnt);

  const { rows: [b] } = await pool.query(`
    SELECT COUNT(*) AS total,
           COUNT(CASE WHEN "finalPrice" > 0 AND "bidRate" > 0 THEN 1 END) AS valid
    FROM "BidResult"
  `);
  console.log("BidResult 총:", b.total, "/ 유효:", b.valid);

  const { rows: [m] } = await pool.query(`
    SELECT COUNT(*) AS matched
    FROM "BidResult" br
    JOIN "Announcement" a ON a."konepsId" = br."annId"
  `);
  console.log("BidResult + Announcement 매칭:", m.matched);

  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
