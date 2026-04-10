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
  // 오늘 추가된 '등록공고' 레코드 1건의 rawJson 전체 내용
  const { rows: [rec] } = await pool.query(`
    SELECT "konepsId", category, "rawJson"
    FROM "Announcement"
    WHERE category = '등록공고' AND "createdAt" >= '2026-04-04'
    LIMIT 1
  `);
  if (rec) {
    console.log("등록공고 샘플:", rec.konepsId, "category:", rec.category);
    const rj = rec.rawJson;
    console.log("pubPrcrmntMidClsfcNm:", rj.pubPrcrmntMidClsfcNm);
    console.log("pubPrcrmntLrgClsfcNm:", rj.pubPrcrmntLrgClsfcNm);
    console.log("ntceKindNm:", rj.ntceKindNm);
    console.log("srvceDivNm:", rj.srvceDivNm);
    console.log("bidNtceNo:", rj.bidNtceNo);
    console.log("전체 키:", Object.keys(rj).join(", "));
  }

  // 오늘 추가된 '용역' 레코드 1건 (비교)
  const { rows: [rec2] } = await pool.query(`
    SELECT "konepsId", category, "rawJson"
    FROM "Announcement"
    WHERE category = '용역' AND "createdAt" >= '2026-04-04'
    LIMIT 1
  `);
  if (rec2) {
    console.log("\n용역 샘플:", rec2.konepsId, "category:", rec2.category);
    const rj = rec2.rawJson;
    console.log("pubPrcrmntMidClsfcNm:", rj.pubPrcrmntMidClsfcNm);
    console.log("ntceKindNm:", rj.ntceKindNm);
  } else {
    console.log("\n오늘 추가된 용역 카테고리 레코드 없음");
  }

  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
