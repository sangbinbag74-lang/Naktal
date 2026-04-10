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
  // 오늘 추가된 "등록공고" 레코드에서 endpoint별 필드 존재 여부 확인
  const { rows } = await pool.query(`
    SELECT
      CASE
        WHEN "rawJson" ? 'srvceDivNm' AND "rawJson"->>'srvceDivNm' != '' THEN 'Servc(용역)'
        WHEN "rawJson" ? 'prdctQty'   AND "rawJson"->>'prdctQty' != ''   THEN 'Thng(물품)'
        WHEN "rawJson" ? 'cnstwkFinshedBgtAmt'                           THEN 'Cnstwk(시설공사)'
        ELSE '알수없음'
      END AS endpoint_type,
      COUNT(*) AS cnt
    FROM "Announcement"
    WHERE category = '등록공고'
      AND "createdAt" >= '2026-04-04'
    GROUP BY 1
    ORDER BY cnt DESC
  `);
  console.log("오늘 등록공고 레코드 endpoint 추정:");
  for (const r of rows) console.log(` ${r.endpoint_type}: ${r.cnt}건`);

  // srvceDivNm 값 분포
  const { rows: r2 } = await pool.query(`
    SELECT "rawJson"->>'srvceDivNm' AS svc, COUNT(*) AS cnt
    FROM "Announcement"
    WHERE category = '등록공고' AND "createdAt" >= '2026-04-04'
      AND "rawJson" ? 'srvceDivNm'
    GROUP BY 1 ORDER BY cnt DESC LIMIT 5
  `);
  console.log("\nsrvceDivNm 값 분포:");
  for (const r of r2) console.log(` "${r.svc}": ${r.cnt}건`);

  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
