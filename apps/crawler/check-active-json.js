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
    await client.query("SET statement_timeout = '10s'");
    const { rows } = await client.query(`
      SELECT "konepsId", "rawJson"
      FROM "Announcement"
      WHERE category = '시설공사' AND deadline > NOW()
      LIMIT 3
    `);
    for (const r of rows) {
      console.log("konepsId:", r.konepsId);
      const rj = r.rawJson;
      console.log("mainCnsttyNm:", rj.mainCnsttyNm ?? "(없음)");
      console.log("pubPrcrmntMidClsfcNm:", rj.pubPrcrmntMidClsfcNm ?? "(없음)");
      console.log("ntceKindNm:", rj.ntceKindNm ?? "(없음)");
      // 모든 키 출력
      const keys = Object.keys(rj);
      console.log("total keys:", keys.length);
      console.log("keys:", keys.slice(0, 20).join(", "));
      console.log("---");
    }
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
