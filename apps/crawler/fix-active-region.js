/**
 * 활성 공고(deadline > NOW()) 중 region='' 레코드를 ntceInsttNm 기반으로 일괄 수정
 * 단 1회 실행 — deadline 조건으로 범위 제한해서 빠름
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
    let k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    result[k] = v.trim();
  }
  return result;
}

const ENV = loadEnv();
const pool = new Pool({ connectionString: ENV.DIRECT_URL || ENV.DATABASE_URL, max: 1 });

async function main() {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = 0");

    const { rowCount } = await client.query(`
      UPDATE "Announcement"
      SET region = CASE
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '서울특별시%' THEN '서울'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '서울%' THEN '서울'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '부산광역시%' THEN '부산'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '부산%' THEN '부산'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '대구광역시%' THEN '대구'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '대구%' THEN '대구'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '인천광역시%' THEN '인천'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '인천%' THEN '인천'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '광주광역시%' THEN '광주'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '광주%' THEN '광주'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '대전광역시%' THEN '대전'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '대전%' THEN '대전'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '울산광역시%' THEN '울산'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '울산%' THEN '울산'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '세종특별자치시%' THEN '세종'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '세종%' THEN '세종'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '경기도%' THEN '경기'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '경기%' THEN '경기'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '강원특별자치도%' THEN '강원'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '강원도%' THEN '강원'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '강원%' THEN '강원'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '충청북도%' THEN '충북'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '충북%' THEN '충북'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '충청남도%' THEN '충남'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '충남%' THEN '충남'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '전북특별자치도%' THEN '전북'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '전라북도%' THEN '전북'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '전북%' THEN '전북'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '전라남도%' THEN '전남'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '전남%' THEN '전남'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '경상북도%' THEN '경북'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '경북%' THEN '경북'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '경상남도%' THEN '경남'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '경남%' THEN '경남'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '제주특별자치도%' THEN '제주'
        WHEN "rawJson"->>'ntceInsttNm' ILIKE '제주%' THEN '제주'
        ELSE region
      END
      WHERE deadline > NOW()
        AND region = ''
        AND "rawJson"->>'ntceInsttNm' IS NOT NULL
        AND "rawJson"->>'ntceInsttNm' != ''
    `);

    console.log(`활성 공고 region 수정: ${rowCount}건`);

    // 결과 확인
    const { rows } = await client.query(`
      SELECT region, COUNT(*)::int AS cnt
      FROM "Announcement"
      WHERE deadline > NOW()
      GROUP BY region
      ORDER BY cnt DESC
      LIMIT 25
    `);
    console.log("\n=== 수정 후 활성 공고 region 분포 ===");
    rows.forEach(r => console.log(`  "${r.region}" : ${r.cnt}건`));

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
