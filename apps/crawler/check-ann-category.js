const { Pool } = require("pg");
const fs = require("fs"), path = require("path");
function loadEnv() {
  const envPath = path.resolve(__dirname, "../../.env");
  if (!fs.existsSync(envPath)) return {};
  const result = {};
  for (let line of fs.readFileSync(envPath, "utf8").split("\n")) {
    line = line.trim(); if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("="); if (eq < 0) continue;
    let k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    result[k] = v.trim();
  }
  return result;
}
const ENV = loadEnv();
const pool = new Pool({ connectionString: ENV.DIRECT_URL, max: 1 });
async function main() {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = 0");

    // 연도별 category 분포 확인 (최근 vs 과거)
    const r1 = await client.query(`
      SELECT EXTRACT(YEAR FROM "createdAt")::int AS yr, category, COUNT(*)::int AS cnt
      FROM "Announcement"
      WHERE category IS NOT NULL AND category != ''
      GROUP BY yr, category
      ORDER BY yr DESC, cnt DESC
      LIMIT 50
    `);
    console.log("연도별 top category:");
    for (const r of r1.rows) console.log(`  ${r.yr} ${r.category}: ${r.cnt}건`);

    // 조경공사 연도 분포
    const r2 = await client.query(`
      SELECT EXTRACT(YEAR FROM "createdAt")::int AS yr, COUNT(*)::int AS cnt
      FROM "Announcement" WHERE category = '조경공사'
      GROUP BY yr ORDER BY yr DESC
    `);
    console.log("\n조경공사 연도 분포:", JSON.stringify(r2.rows));

    // BidResult와 JOIN 가능한 조경공사 공고의 연도 분포
    const r3 = await client.query(`
      SELECT EXTRACT(YEAR FROM a."createdAt")::int AS yr, COUNT(*)::int AS cnt
      FROM "BidResult" b JOIN "Announcement" a ON a."konepsId" = b."annId"
      WHERE a.category = '조경공사'
      GROUP BY yr ORDER BY yr DESC
    `);
    console.log("\nBidResult 있는 조경공사 연도:", JSON.stringify(r3.rows));
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
