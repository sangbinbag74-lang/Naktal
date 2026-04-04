const { Pool } = require("pg");
const fs = require("fs"), path = require("path");
function loadEnv() {
  const envPath = path.resolve(__dirname, "../../.env"); if (!fs.existsSync(envPath)) return {};
  const result = {}; for (let line of fs.readFileSync(envPath, "utf8").split("\n")) { line = line.trim(); if (!line || line.startsWith("#")) continue; const eq = line.indexOf("="); if (eq < 0) continue; let k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); result[k] = v.trim(); } return result;
}
const ENV = loadEnv();
const pool = new Pool({ connectionString: ENV.DIRECT_URL, max: 1 });
async function main() {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = 0");
    // 주요 category별 사정율 실제 분포
    const cats = ['조경공사','토목공사','건축공사','전기공사','물품','설계'];
    for (const cat of cats) {
      const r = await client.query(`
        SELECT
          PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY sr) AS p5,
          PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY sr) AS p25,
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY sr) AS p50,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY sr) AS p75,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY sr) AS p95,
          COUNT(*)::int AS cnt
        FROM (
          SELECT (b."finalPrice"::float / (b."bidRate"::float / 100.0)) / a.budget::float * 100.0 AS sr
          FROM "BidResult" b JOIN "Announcement" a ON a."konepsId" = b."annId"
          WHERE a.category = $1 AND a.budget::float > 0
            AND b."bidRate"::float BETWEEN 50 AND 110
            AND b."finalPrice" IS NOT NULL
        ) t WHERE sr BETWEEN 80 AND 130
      `, [cat]);
      const row = r.rows[0];
      if (row.cnt > 0) console.log(`${cat}: cnt=${row.cnt} p5=${row.p5?.toFixed(1)} p25=${row.p25?.toFixed(1)} p50=${row.p50?.toFixed(1)} p75=${row.p75?.toFixed(1)} p95=${row.p95?.toFixed(1)}`);
    }
  } finally { client.release(); await pool.end(); }
}
main().catch(e => { console.error(e.message); process.exit(1); });
