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

    // 조경공사 사정율 분포 확인
    const r1 = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE a.budget::float > 0)::int AS has_budget,
        COUNT(*) FILTER (WHERE b."bidRate"::float BETWEEN 50 AND 110)::int AS valid_bidrate,
        COUNT(*) FILTER (WHERE
          a.budget::float > 0
          AND b."bidRate"::float BETWEEN 50 AND 110
          AND b."finalPrice" IS NOT NULL
          AND (b."finalPrice"::float / (b."bidRate"::float / 100.0)) / a.budget::float * 100.0 BETWEEN 97 AND 103
        )::int AS valid_sajung
      FROM "BidResult" b
      JOIN "Announcement" a ON a."konepsId" = b."annId"
      WHERE a.category = '조경공사'
    `);
    console.log("조경공사 필터 단계:", r1.rows[0]);

    // 사정율 범위 분포 확인
    const r2 = await client.query(`
      SELECT
        ROUND(((b."finalPrice"::float / (b."bidRate"::float / 100.0)) / a.budget::float * 100.0) / 1.0) AS sr_bucket,
        COUNT(*)::int AS cnt
      FROM "BidResult" b
      JOIN "Announcement" a ON a."konepsId" = b."annId"
      WHERE a.category = '조경공사'
        AND a.budget::float > 0
        AND b."bidRate"::float BETWEEN 50 AND 110
        AND b."finalPrice" IS NOT NULL
      GROUP BY sr_bucket
      ORDER BY cnt DESC
      LIMIT 20
    `);
    console.log("\n조경공사 사정율 분포 (상위20):", r2.rows.map(r => `${r.sr_bucket}%(${r.cnt})`).join(", "));

    // budget 샘플 확인
    const r3 = await client.query(`
      SELECT a.budget, b."bidRate", b."finalPrice",
        (b."finalPrice"::float / (b."bidRate"::float / 100.0)) / a.budget::float * 100.0 AS sajung
      FROM "BidResult" b
      JOIN "Announcement" a ON a."konepsId" = b."annId"
      WHERE a.category = '조경공사'
        AND a.budget::float > 0
        AND b."bidRate"::float BETWEEN 50 AND 110
      LIMIT 5
    `);
    console.log("\n조경공사 샘플 5건:", JSON.stringify(r3.rows));
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
