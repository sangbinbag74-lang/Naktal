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

    // 공고 확인
    const r1 = await client.query(
      `SELECT id, "konepsId", "orgName", category, region, budget FROM "Announcement" WHERE "konepsId" = 'R26BK01440474'`
    );
    console.log("공고:", JSON.stringify(r1.rows[0]));

    if (r1.rows[0]) {
      const { orgName, category, region, budget } = r1.rows[0];
      const budgetNum = parseInt(budget, 10);
      const budgetRange = budgetNum < 100000000 ? "1억미만"
        : budgetNum < 300000000 ? "1억-3억"
        : budgetNum < 1000000000 ? "3억-10억"
        : budgetNum < 3000000000 ? "10억-30억" : "30억이상";

      console.log(`\\n조회 조건: orgName=${orgName}, category=${category}, region=${region}, budgetRange=${budgetRange}`);

      // 1. 정확히 일치하는 SajungRateStat
      const r2 = await client.query(
        `SELECT "orgName", category, "budgetRange", region, "sampleSize" FROM "SajungRateStat"
         WHERE "orgName" = $1 AND category = $2 AND "budgetRange" = $3 AND region = $4`,
        [orgName, category, budgetRange, region]
      );
      console.log("\\n정확 일치:", r2.rows.length > 0 ? JSON.stringify(r2.rows) : "없음");

      // 2. ALL 폴백
      const r3 = await client.query(
        `SELECT "orgName", category, "budgetRange", region, "sampleSize" FROM "SajungRateStat"
         WHERE "orgName" = 'ALL' AND category = $1 AND "budgetRange" = $2 AND region = $3`,
        [category, budgetRange, region]
      );
      console.log("ALL 폴백:", r3.rows.length > 0 ? JSON.stringify(r3.rows) : "없음");

      // 3. 같은 category의 SajungRateStat
      const r4 = await client.query(
        `SELECT "orgName", category, "budgetRange", region, "sampleSize" FROM "SajungRateStat"
         WHERE category = $1 LIMIT 10`,
        [category]
      );
      console.log(`\\n같은 category(${category}) 샘플:`, JSON.stringify(r4.rows));

      // 4. 비슷한 orgName SajungRateStat
      const r5 = await client.query(
        `SELECT "orgName", category, "budgetRange", region, "sampleSize" FROM "SajungRateStat"
         WHERE "orgName" ILIKE '%전북%' LIMIT 10`
      );
      console.log("\\n전북 orgName 샘플:", JSON.stringify(r5.rows));
    }

    // 5. SajungRateStat orgName 최다 분포
    const r6 = await client.query(
      `SELECT "orgName", COUNT(*)::int AS cnt FROM "SajungRateStat" GROUP BY "orgName" ORDER BY cnt DESC LIMIT 10`
    );
    console.log("\\norgName 분포 top10:", JSON.stringify(r6.rows));

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
