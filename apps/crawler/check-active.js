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
const pool = new Pool({ connectionString: getDb(), max: 1 });
(async () => {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = '10s'");
    const { rows: [r1] } = await client.query(`SELECT COUNT(*) AS c FROM "Announcement" WHERE category='토목공사' AND deadline > NOW()`);
    console.log("진행중 토목공사:", r1.c);
    const { rows: [r2] } = await client.query(`SELECT COUNT(*) AS c FROM "Announcement" WHERE category='토목공사'`);
    console.log("전체 토목공사:", r2.c);
    const { rows: [r3] } = await client.query(`SELECT COUNT(*) AS c FROM "Announcement" WHERE deadline > NOW()`);
    console.log("전체 진행중 공고:", r3.c);
    // 카테고리별 진행중 건수
    const { rows } = await client.query(`
      SELECT category, COUNT(*) AS cnt FROM "Announcement"
      WHERE deadline > NOW()
      GROUP BY 1 ORDER BY cnt DESC LIMIT 15
    `);
    console.log("\n진행중 공고 카테고리 분포:");
    for (const r of rows) console.log(`  ${r.category}: ${r.cnt}건`);
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
