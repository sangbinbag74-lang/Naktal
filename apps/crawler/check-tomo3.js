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

    // 시설공사 레코드 5건 샘플 - 토목 관련 키 찾기
    const { rows } = await client.query(`
      SELECT "konepsId", "title", "rawJson"
      FROM "Announcement"
      WHERE category = '시설공사'
      LIMIT 5
    `);
    for (const r of rows) {
      const rj = r.rawJson;
      console.log("konepsId:", r.konepsId);
      console.log("title:", r.title?.slice(0, 40));
      // 분류 관련 필드들
      console.log("pubPrcrmntLrg:", rj.pubPrcrmntLrgClsfcNm);
      console.log("pubPrcrmntMid:", rj.pubPrcrmntMidClsfcNm);
      console.log("indstrytyNm:", rj.indstrytyNm);
      console.log("mainCnsttyNm:", rj.mainCnsttyNm);
      console.log("ntceKindNm:", rj.ntceKindNm);
      console.log("---");
    }

    // indstrytyNm 분포 (시설공사 레코드)
    const { rows: r2 } = await client.query(`
      SELECT "rawJson"->>'indstrytyNm' AS ind, COUNT(*) AS cnt
      FROM "Announcement"
      WHERE category = '시설공사'
      GROUP BY 1 ORDER BY cnt DESC LIMIT 15
    `);
    console.log("\nindstrytyNm 분포 (시설공사):");
    for (const r of r2) console.log(` "${r.ind}": ${r.cnt}건`);

  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
