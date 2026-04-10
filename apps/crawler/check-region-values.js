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
const DB_URL = ENV.DATABASE_URL || ENV.DIRECT_URL;
const pool = new Pool({ connectionString: DB_URL, max: 2, statement_timeout: 15000 });

async function main() {
  const client = await pool.connect();
  try {
    // 전체 region 분포
    const { rows: dist } = await client.query(`
      SELECT region, COUNT(*)::int AS cnt
      FROM "Announcement"
      WHERE deadline > NOW()
      GROUP BY region
      ORDER BY cnt DESC
      LIMIT 30
    `);
    console.log("=== 활성 공고 region 분포 ===");
    dist.forEach(r => console.log(`  "${r.region}" : ${r.cnt}건`));

    // 전북 관련 샘플
    const { rows: sample } = await client.query(`
      SELECT region, "rawJson"->>'ntceInsttAddr' AS addr
      FROM "Announcement"
      WHERE deadline > NOW()
        AND ("rawJson"->>'ntceInsttAddr' ILIKE '전북%' OR "rawJson"->>'ntceInsttAddr' ILIKE '전라북%')
      LIMIT 10
    `);
    console.log("\n=== 전북 주소 샘플 ===");
    sample.forEach(r => console.log(`  region="${r.region}" addr="${r.addr}"`));

    // region='전북' 활성 건수
    const { rows: cnt } = await client.query(`
      SELECT COUNT(*)::int AS cnt FROM "Announcement"
      WHERE region = '전북' AND deadline > NOW()
    `);
    console.log(`\nregion='전북' 활성 공고: ${cnt[0].cnt}건`);
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
