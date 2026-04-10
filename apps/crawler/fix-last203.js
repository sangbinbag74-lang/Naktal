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
    const r = await client.query(`
      UPDATE "Announcement"
      SET category = '시설공사'
      WHERE category = '등록공고'
        AND "rawJson" ? 'mainCnsttyNm'
        AND ("rawJson"->>'mainCnsttyNm' IS NULL OR "rawJson"->>'mainCnsttyNm' = '')
    `);
    console.log("시설공사 최종 fallback:", r.rowCount, "건");
    const { rows: [tot] } = await client.query(`SELECT COUNT(*) AS c FROM "Announcement" WHERE category='등록공고'`);
    console.log("남은 등록공고:", tot.c);
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
