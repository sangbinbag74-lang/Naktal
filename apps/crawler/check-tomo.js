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

    // 토목공사 현재 수
    const { rows: [c1] } = await client.query(`SELECT COUNT(*) AS cnt FROM "Announcement" WHERE category = '토목공사'`);
    console.log("현재 토목공사:", c1.cnt);

    // 시설공사 레코드 중 rawJson에 토목 관련 필드 있는 것
    // G2B에서 토목공사는 indstrytyNm, mainCnsttyNm 등에 토목 관련 값이 들어올 수 있음
    const { rows: [c2] } = await client.query(`
      SELECT COUNT(*) AS cnt FROM "Announcement"
      WHERE category = '시설공사'
        AND ("rawJson"->>'mainCnsttyNm' ILIKE '%토목%'
          OR "rawJson"->>'indutyCtgryNm' ILIKE '%토목%')
    `);
    console.log("시설공사 중 토목 관련 mainCnsttyNm/indutyCtgryNm 포함:", c2.cnt);

    // pubPrcrmntLrgClsfcNm 또는 pubPrcrmntMidClsfcNm에 토목 있는 레코드
    const { rows: [c3] } = await client.query(`
      SELECT COUNT(*) AS cnt FROM "Announcement"
        WHERE ("rawJson"->>'pubPrcrmntLrgClsfcNm' ILIKE '%토목%'
          OR "rawJson"->>'pubPrcrmntMidClsfcNm' ILIKE '%토목%'
          OR "rawJson"->>'pubPrcrmntLrg' ILIKE '%토목%')
    `);
    console.log("rawJson pubPrcrmnt에 토목 포함:", c3.cnt);

    // mainCnsttyNm 값 샘플 (시설공사 레코드)
    const { rows: samples } = await client.query(`
      SELECT "rawJson"->>'mainCnsttyNm' AS main, COUNT(*) AS cnt
      FROM "Announcement"
      WHERE category = '시설공사' AND "rawJson" ? 'mainCnsttyNm'
        AND "rawJson"->>'mainCnsttyNm' != ''
      GROUP BY 1 ORDER BY cnt DESC LIMIT 10
    `);
    console.log("\nmainCnsttyNm 값 (시설공사 상위 10):");
    for (const r of samples) console.log(` "${r.main}": ${r.cnt}건`);

  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
