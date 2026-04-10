/**
 * 등록공고 중 mainCnsttyNm 있는 공사류 → 정확한 category로 분류
 * UI CATEGORY_GROUPS 기준 매핑
 */
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

// mainCnsttyNm → UI category 매핑
const MAPPING = {
  // 토목공사
  "토목공사업":                               "토목공사",
  "산림사업법인(산림토목)":                   "토목공사",
  "수중ㆍ준설공사업":                         "토목공사",
  "철도ㆍ궤도공사업":                         "토목공사",
  "지하수개발·이용시공업":                    "토목공사",
  "(제주지역한정)지하수개발,이용시공업":      "토목공사",
  "전문광해방지사업(토양개량·복원및정화사업)":"토목공사",
  "토양정화업":                               "토목공사",
  "항만운송관련사업(선박수리업)":             "토목공사",
  // 건축공사
  "건축공사업":                               "건축공사",
  // 조경공사
  "조경공사업":                               "조경공사",
  "조경식재ㆍ시설물공사업":                   "조경공사",
  "산림사업법인(숲가꾸기 및 병해충방제)":     "조경공사",
  "산림사업법인(숲길 조성,관리)":             "조경공사",
  "산림사업법인(자연휴양림등 조성)":          "조경공사",
  "산림사업법인(도시숲등 조성, 관리)":        "조경공사",
  "국유림영림단":                             "조경공사",
  "산림조합(지역조합)":                       "조경공사",
  "나무병원(1종)":                            "조경공사",
  "전문국가유산수리업(조경업)":               "조경공사",
  // 전기공사
  "전기공사업":                               "전기공사",
  // 통신공사
  "정보통신공사업":                           "통신공사",
  // 소방시설공사
  "전문소방시설공사업":                       "소방시설공사",
  "일반소방시설공사업(기계)":                 "소방시설공사",
  "일반소방시설공사업(전기)":                 "소방시설공사",
  "전문소방공사감리업":                       "소방시설공사",
  // 기계설비공사
  "기계설비ㆍ가스공사업":                     "기계설비공사",
  "가스난방공사업":                           "기계설비공사",
  "산업·환경설비공사업":                      "기계설비공사",
  "환경전문공사업(대기분야)":                 "기계설비공사",
  "환경전문공사업(수질분야)":                 "기계설비공사",
  "전문광해방지사업(먼지날림,광연및소음·진동방지사업)": "기계설비공사",
  "전문광해방지사업(오염수질의개선사업)":     "기계설비공사",
  "가축분뇨처리시설설계ㆍ시공업":             "기계설비공사",
  // 지반조성포장공사
  "지반조성ㆍ포장공사업":                     "지반조성포장공사",
  // 실내건축공사
  "실내건축공사업":                           "실내건축공사",
  "금속창호ㆍ지붕건축물조립공사업":           "실내건축공사",
  // 철근콘크리트공사
  "철근ㆍ콘크리트공사업":                     "철근콘크리트공사",
  // 구조물해체비계공사
  "구조물해체ㆍ비계공사업":                   "구조물해체비계공사",
  "석면해체.제거업":                          "구조물해체비계공사",
  // 상하수도설비공사
  "상ㆍ하수도설비공사업":                     "상하수도설비공사",
  // 철강재설치공사
  "철강구조물공사업":                         "철강재설치공사",
  // 삭도승강기기계설비공사
  "승강기ㆍ삭도공사업":                       "삭도승강기기계설비공사",
  // 도장습식방수석공사
  "도장ㆍ습식ㆍ방수ㆍ석공사업":               "도장습식방수석공사",
  // 문화재수리공사
  "종합국가유산수리업(보수단청업)":           "문화재수리공사",
  "전문국가유산수리업(보존과학업)":           "문화재수리공사",
  "전문국가유산수리업(식물보호업)":           "문화재수리공사",
};

async function run() {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = '0'");

    // 카테고리별 그룹화
    const byCategory = {};
    for (const [main, cat] of Object.entries(MAPPING)) {
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(main);
    }

    let grandTotal = 0;
    for (const [cat, mains] of Object.entries(byCategory)) {
      const placeholders = mains.map((_, i) => `$${i + 2}`).join(", ");
      let total = 0;
      while (true) {
        const r = await client.query(
          `UPDATE "Announcement"
           SET category = $1
           WHERE id IN (
             SELECT id FROM "Announcement"
             WHERE category = '등록공고'
               AND "rawJson"->>'mainCnsttyNm' IN (${placeholders})
             LIMIT 5000
           )`,
          [cat, ...mains]
        );
        total += r.rowCount;
        if (r.rowCount === 0) break;
        process.stdout.write(`  [${cat}] ${total}건\r`);
      }
      grandTotal += total;
      console.log(`  [${cat}] → ${total}건 완료`);
    }
    console.log(`\n전체 분류 완료: ${grandTotal}건`);

    // 결과 확인
    await client.query("SET statement_timeout = '30s'");
    const { rows } = await client.query(`
      SELECT category, COUNT(*) AS cnt FROM "Announcement"
      WHERE category IN (
        '등록공고','토목공사','건축공사','조경공사','전기공사','통신공사',
        '소방시설공사','기계설비공사','지반조성포장공사','실내건축공사',
        '철근콘크리트공사','구조물해체비계공사','상하수도설비공사',
        '철강재설치공사','삭도승강기기계설비공사','도장습식방수석공사','문화재수리공사'
      )
      GROUP BY 1 ORDER BY cnt DESC
    `);
    console.log("\n=== 분류 후 분포 ===");
    for (const r of rows) console.log(`  ${r.category}: ${r.cnt}건`);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => { console.error(e.message); process.exit(1); });
