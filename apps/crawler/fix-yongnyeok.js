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
      SET category = '용역'
      WHERE category = '등록공고'
        AND "rawJson" ? 'srvceDivNm'
    `);
    console.log("용역 분류 완료:", r.rowCount, "건");
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
