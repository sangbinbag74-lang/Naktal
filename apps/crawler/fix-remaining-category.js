/**
 * 남은 등록공고 최종 분류
 * 1. mainCnsttyNm 키 있음 (Cnstwk, 값 없음) → 시설공사
 * 2. srvceDivNm 있음 (Servc) → 용역
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
    await client.query("SET statement_timeout = '0'");

    // 1. Cnstwk 레코드 (mainCnsttyNm 키 있지만 값 없음) → 시설공사
    let total1 = 0;
    while (true) {
      const r = await client.query(`
        UPDATE "Announcement"
        SET category = '시설공사'
        WHERE id IN (
          SELECT id FROM "Announcement"
          WHERE category = '등록공고'
            AND "rawJson" ? 'mainCnsttyNm'
            AND ("rawJson"->>'mainCnsttyNm' IS NULL OR "rawJson"->>'mainCnsttyNm' = '')
          LIMIT 5000
        )
      `);
      total1 += r.rowCount;
      process.stdout.write(`  [시설공사 fallback] ${total1}건\r`);
      if (r.rowCount === 0) break;
    }
    console.log(`  [시설공사 fallback] → ${total1}건 완료`);

    // 2. Servc 레코드 (srvceDivNm 있음) → 용역
    let total2 = 0;
    while (true) {
      const r = await client.query(`
        UPDATE "Announcement"
        SET category = '용역'
        WHERE id IN (
          SELECT id FROM "Announcement"
          WHERE category = '등록공고'
            AND "rawJson" ? 'srvceDivNm'
          LIMIT 5000
        )
      `);
      total2 += r.rowCount;
      process.stdout.write(`  [용역] ${total2}건\r`);
      if (r.rowCount === 0) break;
    }
    console.log(`  [용역] → ${total2}건 완료`);

    console.log(`\n전체: ${total1 + total2}건 추가 분류 완료`);

    // 최종 분포
    const { rows } = await client.query(`
      SELECT category, COUNT(*) AS cnt FROM "Announcement"
      WHERE category IN (
        '등록공고','시설공사','토목공사','건축공사','조경공사','전기공사','통신공사',
        '소방시설공사','기계설비공사','지반조성포장공사','실내건축공사',
        '철근콘크리트공사','구조물해체비계공사','상하수도설비공사',
        '철강재설치공사','삭도승강기기계설비공사','도장습식방수석공사','문화재수리공사',
        '용역','물품'
      )
      GROUP BY 1 ORDER BY cnt DESC
    `);
    console.log("\n=== 최종 분류 분포 ===");
    for (const r of rows) console.log(`  ${r.category}: ${r.cnt}건`);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => { console.error(e.message); process.exit(1); });
