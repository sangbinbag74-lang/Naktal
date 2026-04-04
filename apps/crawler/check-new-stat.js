const { Pool } = require("pg");
const fs = require("fs"), path = require("path");
function loadEnv() {
  const envPath = path.resolve(__dirname, "../../.env");
  if (!fs.existsSync(envPath)) return {};
  const result = {};
  for (let line of fs.readFileSync(envPath, "utf8").split("\n")) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
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

    // 조경공사 SajungRateStat
    const r1 = await client.query(`SELECT "orgName", "budgetRange", region, "sampleSize" FROM "SajungRateStat" WHERE category = '조경공사' ORDER BY "sampleSize" DESC LIMIT 10`);
    console.log("조경공사 SajungRateStat:", JSON.stringify(r1.rows));

    // 전체 category 분포 top15
    const r2 = await client.query(`SELECT category, COUNT(*)::int AS rows, SUM("sampleSize")::int AS samples FROM "SajungRateStat" GROUP BY category ORDER BY samples DESC LIMIT 15`);
    console.log("\ncategory 분포 top15:");
    for (const row of r2.rows) console.log(`  ${row.category}: ${row.rows}행, ${row.samples}건`);

    // 김제시 공고 관련 SajungRateStat 조회
    const r3 = await client.query(`SELECT "orgName", category, "budgetRange", region, "sampleSize", avg, stddev FROM "SajungRateStat" WHERE "orgName" ILIKE '%김제%' LIMIT 5`);
    console.log("\n김제 orgName:", JSON.stringify(r3.rows));

    const r4 = await client.query(`SELECT "orgName", category, "budgetRange", region, "sampleSize", avg FROM "SajungRateStat" WHERE "orgName" = 'ALL' AND category = '조경공사' ORDER BY "sampleSize" DESC`);
    console.log("\nALL 조경공사:", JSON.stringify(r4.rows));
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
