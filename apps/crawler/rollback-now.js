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
  let total = 0;
  try {
    while (true) {
      await client.query("SET statement_timeout = '120s'");
      const r = await client.query(`
        UPDATE "Announcement"
        SET category = '등록공고'
        WHERE id IN (
          SELECT id FROM "Announcement"
          WHERE category = '시설공사'
            AND ("rawJson"->>'pubPrcrmntLrgClsfcNm' IS NULL
              OR "rawJson"->>'pubPrcrmntLrgClsfcNm' = '')
          LIMIT 5000
        )
      `);
      total += r.rowCount;
      process.stdout.write(`  ${total}건 롤백\r`);
      if (r.rowCount === 0) break;
    }
    console.log(`\n완료: 총 ${total}건 등록공고로 복원`);
    const { rows: [r1] } = await client.query(`SELECT COUNT(*) AS c FROM "Announcement" WHERE category='시설공사'`);
    const { rows: [r2] } = await client.query(`SELECT COUNT(*) AS c FROM "Announcement" WHERE category='등록공고'`);
    console.log("시설공사 잔량:", r1.c);
    console.log("등록공고 복원:", r2.c);
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
