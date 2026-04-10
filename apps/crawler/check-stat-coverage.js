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

    // 1. BidResult 전체 건수 vs 사정율 계산 가능 건수
    const r1 = await client.query(`
      SELECT COUNT(*) AS total,
             COUNT(*) FILTER (WHERE "bidRate" IS NOT NULL AND "finalPrice" IS NOT NULL AND "bidRate"::float BETWEEN 50 AND 110) AS valid
      FROM "BidResult"
    `);
    console.log("BidResult 전체/유효:", r1.rows[0]);

    // 2. SajungRateStat 전체 건수
    const r2 = await client.query(`SELECT COUNT(*) AS cnt, SUM("sampleSize") AS total_samples FROM "SajungRateStat"`);
    console.log("SajungRateStat 레코드/총샘플:", r2.rows[0]);

    // 3. 조경공사 BidResult 건수 (사정율 계산 가능)
    const r3 = await client.query(`
      SELECT COUNT(*) AS cnt FROM "BidResult" b
      JOIN "Announcement" a ON a."konepsId" = b."annId"
      WHERE a.category = '조경공사'
        AND b."bidRate"::float BETWEEN 50 AND 110
        AND b."finalPrice" IS NOT NULL
    `);
    console.log("조경공사 유효 BidResult:", r3.rows[0]);

    // 4. 조경공사 SajungRateStat
    const r4 = await client.query(`
      SELECT "orgName", "budgetRange", region, "sampleSize"
      FROM "SajungRateStat" WHERE category = '조경공사' ORDER BY "sampleSize" DESC LIMIT 10
    `);
    console.log("조경공사 SajungRateStat:", r4.rows);

    // 5. SajungRateStat category 분포
    const r5 = await client.query(`
      SELECT category, COUNT(*) AS rows, SUM("sampleSize") AS samples
      FROM "SajungRateStat" GROUP BY category ORDER BY samples DESC LIMIT 15
    `);
    console.log("category별 SajungRateStat:", r5.rows);

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
