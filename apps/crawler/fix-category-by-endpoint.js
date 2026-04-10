/**
 * 오늘(2026-04-04) 추가된 "등록공고" 레코드를 endpoint별 rawJson 필드 패턴으로 카테고리 수정
 *
 * - Cnstwk(시설공사): mainCnsttyNm 또는 cnstrtnAbltyEvlAmtList 존재
 * - Thng(물품): prdctQty 존재
 * - Servc(용역): srvceDivNm 존재
 */
const { Pool } = require("pg");
const fs = require("fs"), path = require("path");

function getDb() {
  const env = fs.readFileSync(path.resolve(__dirname, "../../.env"), "utf-8");
  for (const l of env.split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "DATABASE_URL" && v && !v.includes("[YOUR-PASSWORD]")) return v;
  }
}

const pool = new Pool({ connectionString: getDb(), max: 2 });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = '120s'");

    // 1. Cnstwk → 시설공사
    console.log("[1/3] Cnstwk → 시설공사 업데이트 중...");
    const r1 = await client.query(`
      UPDATE "Announcement"
      SET category = '시설공사'
      WHERE category = '등록공고'
        AND "createdAt" >= '2026-04-04'
        AND (
          ("rawJson" ? 'mainCnsttyNm' AND "rawJson"->>'mainCnsttyNm' != '')
          OR ("rawJson" ? 'cnstrtnAbltyEvlAmtList' AND "rawJson"->>'cnstrtnAbltyEvlAmtList' != '')
          OR ("rawJson" ? 'pqEvalYn')
        )
    `);
    console.log(`  → ${r1.rowCount}건 시설공사로 수정`);

    // 2. Thng → 물품
    console.log("[2/3] Thng → 물품 업데이트 중...");
    const r2 = await client.query(`
      UPDATE "Announcement"
      SET category = '물품'
      WHERE category = '등록공고'
        AND "createdAt" >= '2026-04-04'
        AND "rawJson" ? 'prdctQty'
        AND "rawJson"->>'prdctQty' != ''
    `);
    console.log(`  → ${r2.rowCount}건 물품으로 수정`);

    // 3. Servc → 용역
    console.log("[3/3] Servc → 용역 업데이트 중...");
    const r3 = await client.query(`
      UPDATE "Announcement"
      SET category = '용역'
      WHERE category = '등록공고'
        AND "createdAt" >= '2026-04-04'
        AND "rawJson" ? 'srvceDivNm'
        AND "rawJson"->>'srvceDivNm' != ''
    `);
    console.log(`  → ${r3.rowCount}건 용역으로 수정`);

    // 결과 확인
    const { rows } = await client.query(`
      SELECT category, COUNT(*) AS cnt
      FROM "Announcement"
      WHERE "createdAt" >= '2026-04-04'
      GROUP BY category ORDER BY cnt DESC
    `);
    console.log("\n수정 후 오늘 추가된 공고 category 분포:");
    for (const r of rows) console.log(`  ${r.category}: ${r.cnt}건`);

    // 남은 등록공고 확인
    const { rows: remaining } = await client.query(`
      SELECT COUNT(*) AS cnt FROM "Announcement"
      WHERE category = '등록공고' AND "createdAt" >= '2026-04-04'
    `);
    console.log(`\n남은 등록공고: ${remaining[0].cnt}건`);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => { console.error(e.message); process.exit(1); });
