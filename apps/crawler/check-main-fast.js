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
    await client.query("SET statement_timeout = '0'"); // no timeout

    // 등록공고 중 mainCnsttyNm 있는 것만
    const { rows } = await client.query(`
      SELECT "rawJson"->>'mainCnsttyNm' AS main, COUNT(*) AS cnt
      FROM "Announcement"
      WHERE category = '등록공고'
        AND "rawJson" ? 'mainCnsttyNm'
        AND "rawJson"->>'mainCnsttyNm' != ''
      GROUP BY 1
      ORDER BY cnt DESC
      LIMIT 50
    `);
    console.log("등록공고 중 mainCnsttyNm 분포:");
    for (const r of rows) console.log(`  "${r.main}": ${r.cnt}건`);

    // 총 등록공고 수
    const { rows: [tot] } = await client.query(`SELECT COUNT(*) AS c FROM "Announcement" WHERE category='등록공고'`);
    console.log("\n총 등록공고:", tot.c);

    // mainCnsttyNm 있는 등록공고 수
    const { rows: [hasmain] } = await client.query(`
      SELECT COUNT(*) AS c FROM "Announcement"
      WHERE category='등록공고' AND "rawJson" ? 'mainCnsttyNm' AND "rawJson"->>'mainCnsttyNm' != ''
    `);
    console.log("mainCnsttyNm 있는 등록공고:", hasmain.c);

  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
