// 진행중(active) 시설공사 공고 중 mainCnsttyNm이 있는 것 재분류
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

const MAP = {
  "토목공사업": "토목공사", "산림사업법인(산림토목)": "토목공사",
  "수중ㆍ준설공사업": "토목공사", "철도ㆍ궤도공사업": "토목공사",
  "지하수개발·이용시공업": "토목공사", "(제주지역한정)지하수개발,이용시공업": "토목공사",
  "전문광해방지사업(토양개량·복원및정화사업)": "토목공사", "토양정화업": "토목공사",
  "항만운송관련사업(선박수리업)": "토목공사",
  "건축공사업": "건축공사",
  "조경공사업": "조경공사", "조경식재ㆍ시설물공사업": "조경공사",
  "전기공사업": "전기공사", "전기공사업(발전설비)": "전기공사",
  "전문전기공사업(내선전기공사업)": "전기공사", "전문전기공사업(외선전기공사업)": "전기공사",
  "통신공사업": "통신공사", "전문정보통신공사업(구내통신공사업)": "통신공사",
  "전문정보통신공사업(구내방송·공청안테나공사업)": "통신공사",
  "전문정보통신공사업(정보통신공사업)": "통신공사",
  "소방시설공사업(일반)": "소방공사", "소방시설공사업(전문)": "소방공사",
  "기계설비공사업": "기계공사", "온돌공사업": "기계공사",
  "승강기공사업": "승강기공사",
  "문화재수리업(보수단청공사업)": "문화재수리공사", "문화재수리업(실측설계업)": "문화재수리공사",
  "전문국가유산수리업(식물보호업)": "문화재수리공사",
};

(async () => {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = '0'");

    // mainCnsttyNm별 분포 확인 (active 시설공사)
    const { rows: dist } = await client.query(`
      SELECT "rawJson"->>'mainCnsttyNm' AS nm, COUNT(*) AS cnt
      FROM "Announcement"
      WHERE category = '시설공사' AND deadline > NOW()
        AND "rawJson" ? 'mainCnsttyNm'
        AND ("rawJson"->>'mainCnsttyNm') IS NOT NULL
        AND ("rawJson"->>'mainCnsttyNm') != ''
      GROUP BY 1 ORDER BY cnt DESC LIMIT 30
    `);
    console.log("진행중 시설공사 mainCnsttyNm 분포:");
    for (const r of dist) console.log(`  ${r.nm}: ${r.cnt}건`);

    let total = 0;
    for (const [nm, cat] of Object.entries(MAP)) {
      const r = await client.query(`
        UPDATE "Announcement"
        SET category = $1
        WHERE category = '시설공사'
          AND deadline > NOW()
          AND "rawJson"->>'mainCnsttyNm' = $2
      `, [cat, nm]);
      if (r.rowCount > 0) {
        console.log(`  ${nm} → ${cat}: ${r.rowCount}건`);
        total += r.rowCount;
      }
    }
    console.log("\n재분류 완료:", total, "건");

    const { rows: [rem] } = await client.query(
      `SELECT COUNT(*) AS c FROM "Announcement" WHERE category='시설공사' AND deadline > NOW()`
    );
    console.log("남은 진행중 시설공사:", rem.c, "건");

    const { rows: [tc] } = await client.query(
      `SELECT COUNT(*) AS c FROM "Announcement" WHERE category='토목공사' AND deadline > NOW()`
    );
    console.log("진행중 토목공사:", tc.c, "건");
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
