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
    await client.query("SET statement_timeout = '60s'");

    // pubPrcrmnt 필드에서 토목 포함 레코드 — LIMIT으로 빠르게
    const { rows: [c1] } = await client.query(`
      SELECT COUNT(*) AS cnt FROM "Announcement"
      WHERE "rawJson"->>'pubPrcrmntLrgClsfcNm' ILIKE '%토목%'
    `);
    console.log("pubPrcrmntLrgClsfcNm에 토목 포함:", c1.cnt);

    // 전체 category 중 건설 관련 카테고리
    const { rows } = await client.query(`
      SELECT category, COUNT(*) AS cnt FROM "Announcement"
      WHERE category ILIKE '%토목%' OR category ILIKE '%건설%' OR category ILIKE '%공사%'
      GROUP BY category ORDER BY cnt DESC LIMIT 10
    `);
    console.log("\n건설 관련 category 목록:");
    for (const r of rows) console.log(` "${r.category}": ${r.cnt}건`);

    // 시설공사 레코드 샘플 1건 - 전체 rawJson 키
    const { rows: [samp] } = await client.query(`
      SELECT "rawJson" FROM "Announcement"
      WHERE category = '시설공사' LIMIT 1
    `);
    if (samp) {
      const keys = Object.keys(samp.rawJson).filter(k => k.toLowerCase().includes('cnstwk') || k.toLowerCase().includes('tomo') || k.toLowerCase().includes('indstry') || k.toLowerCase().includes('pubprc'));
      console.log("\n시설공사 rawJson 중 관련 키:", keys);
      for (const k of keys) console.log(` ${k}: "${samp.rawJson[k]}"`);
    }

  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
