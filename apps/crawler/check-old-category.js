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
(async () => {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = '30s'");

    // 기존(오늘 이전) 등록공고 레코드 수
    const { rows: [total] } = await client.query(`
      SELECT COUNT(*) AS cnt FROM "Announcement"
      WHERE category = '등록공고' AND "createdAt" < '2026-04-04'
    `);
    console.log("기존 등록공고 레코드(오늘 이전):", total.cnt);

    // endpoint 패턴별 분류 가능 수
    const { rows } = await client.query(`
      SELECT
        CASE
          WHEN "rawJson" ? 'mainCnsttyNm' AND "rawJson"->>'mainCnsttyNm' != '' THEN 'Cnstwk(시설공사)'
          WHEN "rawJson" ? 'pqEvalYn'                                            THEN 'Cnstwk-pq(시설공사)'
          WHEN "rawJson" ? 'prdctQty' AND "rawJson"->>'prdctQty' != ''          THEN 'Thng(물품)'
          WHEN "rawJson" ? 'srvceDivNm' AND "rawJson"->>'srvceDivNm' != ''      THEN 'Servc(용역)'
          ELSE '알수없음'
        END AS type,
        COUNT(*) AS cnt
      FROM "Announcement"
      WHERE category = '등록공고' AND "createdAt" < '2026-04-04'
      GROUP BY 1 ORDER BY cnt DESC
    `);
    console.log("\n기존 등록공고 endpoint 분류:");
    for (const r of rows) console.log(` ${r.type}: ${r.cnt}건`);
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
