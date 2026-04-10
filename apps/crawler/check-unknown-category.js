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
  // "알수없음" 레코드 1건 샘플 - 전체 키 확인
  const { rows: [rec] } = await pool.query(`
    SELECT "konepsId", "rawJson"
    FROM "Announcement"
    WHERE category = '등록공고'
      AND "createdAt" >= '2026-04-04'
      AND NOT ("rawJson" ? 'srvceDivNm' AND "rawJson"->>'srvceDivNm' != '')
      AND NOT ("rawJson" ? 'prdctQty' AND "rawJson"->>'prdctQty' != '')
    LIMIT 1
  `);
  if (rec) {
    const rj = rec.rawJson;
    console.log("알수없음 샘플 konepsId:", rec.konepsId);
    console.log("ntceKindNm:", rj.ntceKindNm);
    console.log("srvceDivNm:", rj.srvceDivNm);
    console.log("bidMethdNm:", rj.bidMethdNm);
    // Check for construction-specific keys
    console.log("cnstwkFinshedBgtAmt:", rj.cnstwkFinshedBgtAmt);
    console.log("cnstrctPlcAdres:", rj.cnstrctPlcAdres);
    console.log("전체 키:", Object.keys(rj).sort().join(", "));
  }

  // ntceKindNm 분포 확인
  const { rows } = await pool.query(`
    SELECT "rawJson"->>'ntceKindNm' AS kind, COUNT(*) AS cnt
    FROM "Announcement"
    WHERE category = '등록공고' AND "createdAt" >= '2026-04-04'
      AND NOT ("rawJson" ? 'srvceDivNm' AND "rawJson"->>'srvceDivNm' != '')
      AND NOT ("rawJson" ? 'prdctQty' AND "rawJson"->>'prdctQty' != '')
    GROUP BY 1 ORDER BY cnt DESC LIMIT 10
  `);
  console.log("\n알수없음 ntceKindNm 분포:");
  for (const r of rows) console.log(` "${r.kind}": ${r.cnt}건`);

  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
