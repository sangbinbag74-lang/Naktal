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
    await client.query("SET statement_timeout = '0'");
    const { rows } = await client.query(`
      SELECT category, COUNT(*) AS cnt
      FROM "Announcement"
      GROUP BY 1
      ORDER BY cnt DESC
      LIMIT 30
    `);
    console.log("=== 전체 category 분포 ===");
    for (const r of rows) console.log(`  ${r.category}: ${r.cnt}건`);
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
