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
    await client.query("SET statement_timeout = '90s'");

    // 각 endpoint별 필드 존재 수를 개별 쿼리로
    const { rows: [c1] } = await client.query(`
      SELECT COUNT(*) AS cnt FROM "Announcement"
      WHERE category = '등록공고' AND "createdAt" < '2026-04-04'
        AND ("rawJson" ? 'mainCnsttyNm' OR "rawJson" ? 'pqEvalYn')
    `);
    console.log("Cnstwk(시설공사) 패턴:", c1.cnt);

    const { rows: [c2] } = await client.query(`
      SELECT COUNT(*) AS cnt FROM "Announcement"
      WHERE category = '등록공고' AND "createdAt" < '2026-04-04'
        AND "rawJson" ? 'prdctQty' AND "rawJson"->>'prdctQty' != ''
    `);
    console.log("Thng(물품) 패턴:", c2.cnt);

    const { rows: [c3] } = await client.query(`
      SELECT COUNT(*) AS cnt FROM "Announcement"
      WHERE category = '등록공고' AND "createdAt" < '2026-04-04'
        AND "rawJson" ? 'srvceDivNm' AND "rawJson"->>'srvceDivNm' != ''
    `);
    console.log("Servc(용역) 패턴:", c3.cnt);

  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
