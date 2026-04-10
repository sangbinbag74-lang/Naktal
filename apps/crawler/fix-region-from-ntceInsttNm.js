/**
 * ntceInsttNm 기반으로 region="" 레코드 일괄 수정
 * 배치 500건 × 타임아웃 30초
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
const pool = new Pool({ connectionString: ENV.DIRECT_URL || ENV.DATABASE_URL, max: 2, statement_timeout: 0 });

const CASES = [
  ["서울특별시", "서울"], ["서울", "서울"],
  ["부산광역시", "부산"], ["부산", "부산"],
  ["대구광역시", "대구"], ["대구", "대구"],
  ["인천광역시", "인천"], ["인천", "인천"],
  ["광주광역시", "광주"], ["광주", "광주"],
  ["대전광역시", "대전"], ["대전", "대전"],
  ["울산광역시", "울산"], ["울산", "울산"],
  ["세종특별자치시", "세종"], ["세종", "세종"],
  ["경기도", "경기"], ["경기", "경기"],
  ["강원특별자치도", "강원"], ["강원도", "강원"], ["강원", "강원"],
  ["충청북도", "충북"], ["충북", "충북"],
  ["충청남도", "충남"], ["충남", "충남"],
  ["전라북도", "전북"], ["전북특별자치도", "전북"], ["전북", "전북"],
  ["전라남도", "전남"], ["전남", "전남"],
  ["경상북도", "경북"], ["경북", "경북"],
  ["경상남도", "경남"], ["경남", "경남"],
  ["제주특별자치도", "제주"], ["제주", "제주"],
];

function buildCaseWhen() {
  return CASES.map(([prefix, code]) =>
    `WHEN "rawJson"->>'ntceInsttNm' ILIKE '${prefix}%' THEN '${code}'`
  ).join("\n      ");
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = 0");
    // 전체 건수 확인
    const { rows: cnt } = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM "Announcement" WHERE region = '' AND "rawJson"->>'ntceInsttNm' IS NOT NULL AND "rawJson"->>'ntceInsttNm' != ''`
    );
    console.log(`수정 대상: ${cnt[0].cnt}건`);

    let offset = 0;
    const batchSize = 100;
    let totalFixed = 0;

    while (true) {
      // ID 배치 조회
      const { rows: ids } = await client.query(
        `SELECT id FROM "Announcement"
         WHERE region = ''
           AND "rawJson"->>'ntceInsttNm' IS NOT NULL
           AND "rawJson"->>'ntceInsttNm' != ''
         ORDER BY id
         LIMIT $1 OFFSET $2`,
        [batchSize, offset]
      );

      if (ids.length === 0) break;
      const idList = ids.map(r => `'${r.id}'`).join(",");

      const { rowCount } = await client.query(`
        UPDATE "Announcement"
        SET region = CASE
          ${buildCaseWhen()}
          ELSE ''
        END
        WHERE id IN (${idList})
          AND region = ''
          AND "rawJson"->>'ntceInsttNm' IS NOT NULL
      `);

      totalFixed += rowCount;
      console.log(`  배치 offset=${offset}: ${rowCount}건 수정 (누적 ${totalFixed}건)`);
      offset += batchSize;

      await new Promise(r => setTimeout(r, 100)); // DB 부하 방지
    }

    console.log(`\n완료: 총 ${totalFixed}건 region 수정`);

    // 결과 확인
    const { rows: dist } = await client.query(`
      SELECT region, COUNT(*)::int AS cnt
      FROM "Announcement"
      WHERE deadline > NOW()
      GROUP BY region
      ORDER BY cnt DESC
      LIMIT 20
    `);
    console.log("\n=== 수정 후 region 분포 ===");
    dist.forEach(r => console.log(`  "${r.region}" : ${r.cnt}건`));

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
