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
const pool = new Pool({ connectionString: getDb(), max: 1 });
(async () => {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = '0'");
    // 등록공고 중 mainCnsttyNm 키 있음 (아직 처리 안 된 것)
    const { rows: [r1] } = await client.query(`
      SELECT COUNT(*) AS c FROM "Announcement"
      WHERE category = '등록공고'
        AND "rawJson" ? 'mainCnsttyNm'
        AND ("rawJson"->>'mainCnsttyNm' IS NULL OR "rawJson"->>'mainCnsttyNm' = '')
    `);
    console.log("남은 처리 대상 (mainCnsttyNm 키 있고 값 없음):", r1.c);
    // srvceDivNm 있는 것
    const { rows: [r2] } = await client.query(`
      SELECT COUNT(*) AS c FROM "Announcement"
      WHERE category = '등록공고' AND "rawJson" ? 'srvceDivNm'
    `);
    console.log("남은 srvceDivNm (용역):", r2.c);
    // 어디에도 안 속하는 것
    const { rows: [r3] } = await client.query(`
      SELECT COUNT(*) AS c FROM "Announcement"
      WHERE category = '등록공고'
        AND NOT ("rawJson" ? 'mainCnsttyNm')
        AND NOT ("rawJson" ? 'srvceDivNm')
    `);
    console.log("미분류 (남은 등록공고):", r3.c);
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
