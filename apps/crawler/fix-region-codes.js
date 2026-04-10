/**
 * DB 지역 코드 보정 스크립트 (배치 처리)
 * - "전라북도..." → region = "전북"  등
 * 실행: node apps/crawler/fix-region-codes.js
 */
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
    let k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    const ci = v.indexOf(" #");
    if (ci > 0) v = v.slice(0, ci);
    result[k] = v.trim();
  }
  return result;
}

const ENV = loadEnv();
const DB_URL = ENV.DATABASE_URL || ENV.DIRECT_URL;
if (!DB_URL || DB_URL.includes("[YOUR-PASSWORD]")) {
  console.error("DATABASE_URL 또는 DIRECT_URL 누락");
  process.exit(1);
}

const FIXES = [
  { prefix: "전라북도", code: "전북" },
  { prefix: "전라남도", code: "전남" },
  { prefix: "충청북도", code: "충북" },
  { prefix: "충청남도", code: "충남" },
  { prefix: "경상북도", code: "경북" },
  { prefix: "경상남도", code: "경남" },
];

const BATCH = 500;

async function fixRegion(client, prefix, code) {
  let offset = 0, totalUpdated = 0;
  while (true) {
    // 배치: id 먼저 수집
    const { rows } = await client.query(
      `SELECT id FROM "Announcement"
       WHERE "rawJson"->>'ntceInsttAddr' ILIKE $1 AND region != $2
       ORDER BY id LIMIT $3`,
      [`${prefix}%`, code, BATCH]
    );
    if (rows.length === 0) break;
    const ids = rows.map(r => r.id);
    const { rowCount } = await client.query(
      `UPDATE "Announcement" SET region = $1 WHERE id = ANY($2::uuid[])`,
      [code, ids]
    );
    totalUpdated += rowCount ?? 0;
    process.stdout.write(`\r  ${prefix} → ${code}: ${totalUpdated}건...`);
    if (rows.length < BATCH) break;
  }
  return totalUpdated;
}

async function main() {
  const pool = new Pool({ connectionString: DB_URL, max: 2 });
  const client = await pool.connect();
  // statement_timeout 제거 (배치라 괜찮음)
  await client.query("SET statement_timeout = 0");
  try {
    let grand = 0;
    for (const { prefix, code } of FIXES) {
      const n = await fixRegion(client, prefix, code);
      if (n === 0) console.log(`[SKIP] ${prefix} → ${code} : 0건`);
      else console.log(`\n[OK]   ${prefix} → ${code} : ${n}건`);
      grand += n;
    }
    console.log(`\n완료: 총 ${grand}건 보정`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
