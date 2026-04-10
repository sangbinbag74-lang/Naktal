/**
 * 모든 "등록공고" 레코드를 endpoint 패턴으로 카테고리 수정
 * (날짜 제한 없음 - 전체 적용)
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

async function updateBatch(client, sql) {
  let total = 0;
  while (true) {
    await client.query("SET statement_timeout = '180s'");
    const r = await client.query(sql);
    total += r.rowCount;
    process.stdout.write(`  ${total}건 수정 완료\r`);
    if (r.rowCount === 0) break;
  }
  console.log(`  총 ${total}건 수정`);
  return total;
}

async function run() {
  const client = await pool.connect();
  try {
    // 1. Cnstwk → 시설공사 (mainCnsttyNm, pqEvalYn, cnstrtnAbltyEvlAmtList)
    console.log("[1/3] Cnstwk → 시설공사 (전체 등록공고)...");
    await updateBatch(client, `
      UPDATE "Announcement"
      SET category = '시설공사'
      WHERE id IN (
        SELECT id FROM "Announcement"
        WHERE category = '등록공고'
          AND (
            ("rawJson" ? 'mainCnsttyNm' AND "rawJson"->>'mainCnsttyNm' != '')
            OR ("rawJson" ? 'cnstrtnAbltyEvlAmtList' AND "rawJson"->>'cnstrtnAbltyEvlAmtList' != '')
            OR ("rawJson" ? 'pqEvalYn')
          )
        LIMIT 5000
      )
    `);

    // 2. Thng → 물품
    console.log("[2/3] Thng → 물품 (전체 등록공고)...");
    await updateBatch(client, `
      UPDATE "Announcement"
      SET category = '물품'
      WHERE id IN (
        SELECT id FROM "Announcement"
        WHERE category = '등록공고'
          AND "rawJson" ? 'prdctQty'
          AND "rawJson"->>'prdctQty' != ''
        LIMIT 5000
      )
    `);

    // 3. Servc → 용역
    console.log("[3/3] Servc → 용역 (전체 등록공고)...");
    await updateBatch(client, `
      UPDATE "Announcement"
      SET category = '용역'
      WHERE id IN (
        SELECT id FROM "Announcement"
        WHERE category = '등록공고'
          AND "rawJson" ? 'srvceDivNm'
          AND "rawJson"->>'srvceDivNm' != ''
        LIMIT 5000
      )
    `);

    // 최종 등록공고 잔량
    const { rows: [rem] } = await client.query(`SELECT COUNT(*) AS cnt FROM "Announcement" WHERE category = '등록공고'`);
    console.log("\n남은 등록공고:", rem.cnt);

    // 전체 category 분포 (상위 10)
    const { rows } = await client.query(`
      SELECT category, COUNT(*) AS cnt FROM "Announcement"
      GROUP BY category ORDER BY cnt DESC LIMIT 15
    `);
    console.log("\n전체 category 분포 (상위 15):");
    for (const r of rows) console.log(`  ${r.category}: ${r.cnt}건`);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => { console.error(e.message); process.exit(1); });
