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
    await client.query("SET statement_timeout = '300s'");

    // Thng → 물품
    const r1 = await client.query(`
      UPDATE "Announcement" SET category = '물품'
      WHERE category = '등록공고'
        AND "rawJson" ? 'prdctQty'
        AND "rawJson"->>'prdctQty' != ''
    `);
    console.log("Thng→물품:", r1.rowCount);

    // Servc → 용역
    const r2 = await client.query(`
      UPDATE "Announcement" SET category = '용역'
      WHERE category = '등록공고'
        AND "rawJson" ? 'srvceDivNm'
        AND "rawJson"->>'srvceDivNm' != ''
    `);
    console.log("Servc→용역:", r2.rowCount);

    const { rows: [rem] } = await client.query("SELECT COUNT(*) AS cnt FROM \"Announcement\" WHERE category = '등록공고'");
    console.log("남은 등록공고:", rem.cnt);

    // 전체 category 상위 분포
    const { rows } = await client.query(`
      SELECT category, COUNT(*) AS cnt FROM "Announcement"
      GROUP BY category ORDER BY cnt DESC LIMIT 10
    `);
    console.log("\n전체 category 분포 (상위 10):");
    for (const r of rows) console.log(`  ${r.category}: ${r.cnt}건`);
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
