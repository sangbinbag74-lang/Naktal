/**
 * 손상 복구: rawJson.subsiCnsttyNm1-5 → subCategories
 * - 영향: 2003-05, 2004-09, 2020-12 (refill로 빈 배열 덮어씀)
 * - 안전: WHERE에 deadline 범위 + subCategories 빈 행 + subsiCnsttyNm1 존재
 *   기존 채워진 다른 행은 절대 건드리지 않음
 * - 공사(Cnstwk) 공고만 복구. 용역/물품은 LicenseLimit API 별도 필요
 */
import { Client } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadDb(): string {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(rootEnv, "utf-8");
  let direct = "", db = "";
  for (const l of c.split("\n")) {
    const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i === -1) continue;
    const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "DIRECT_URL" && v && !v.includes("[YOUR-PASSWORD]")) direct = v;
    if (k === "DATABASE_URL" && v && !v.includes("[YOUR-PASSWORD]") && !db) db = v;
  }
  return direct || db;
}

const MAPPING = `
CASE sub_raw
  WHEN '건축공사업' THEN '건축공사'
  WHEN '토건공사업' THEN '토건공사'
  WHEN '토목공사업' THEN '토목공사'
  WHEN '조경공사업' THEN '조경공사'
  WHEN '산업환경설비공사업' THEN '산업환경공사'
  WHEN '전기공사업' THEN '전기공사'
  WHEN '정보통신공사업' THEN '통신공사'
  WHEN '전문소방시설공사업' THEN '소방시설공사'
  WHEN '일반소방시설공사업(기계)' THEN '소방시설공사'
  WHEN '일반소방시설공사업(전기)' THEN '소방시설공사'
  WHEN '전문소방공사감리업' THEN '소방시설공사'
  WHEN '지반조성ㆍ포장공사업' THEN '지반조성포장공사'
  WHEN '포장공사업' THEN '지반조성포장공사'
  WHEN '보링ㆍ그라우팅ㆍ파일공사업' THEN '지반조성포장공사'
  WHEN '실내건축공사업' THEN '실내건축공사'
  WHEN '금속창호ㆍ지붕건축물조립공사업' THEN '실내건축공사'
  WHEN '금속구조물ㆍ창호ㆍ온실공사업' THEN '실내건축공사'
  WHEN '철근ㆍ콘크리트공사업' THEN '철근콘크리트공사'
  WHEN '구조물해체ㆍ비계공사업' THEN '구조물해체비계공사'
  WHEN '석면해체.제거업' THEN '구조물해체비계공사'
  WHEN '상ㆍ하수도설비공사업' THEN '상하수도설비공사'
  WHEN '도장ㆍ습식ㆍ방수ㆍ석공사업' THEN '도장습식방수석공사'
  WHEN '조경식재공사업' THEN '조경식재공사'
  WHEN '조경시설물설치공사업' THEN '조경시설물공사'
  WHEN '조경식재ㆍ시설물공사업' THEN '조경식재공사'
  WHEN '철강구조물공사업' THEN '철강재설치공사'
  WHEN '강구조물공사업' THEN '철강재설치공사'
  WHEN '기계설비ㆍ가스공사업' THEN '기계설비공사'
  WHEN '기계설비공사업' THEN '기계설비공사'
  WHEN '삭도ㆍ승강기ㆍ기계설비공사업' THEN '기계설비공사'
  WHEN '승강기ㆍ삭도공사업' THEN '기계설비공사'
  WHEN '가스난방공사업' THEN '기계설비공사'
  WHEN '수중ㆍ준설공사업' THEN '수중공사'
  WHEN '수중공사업' THEN '수중공사'
  WHEN '준설공사업' THEN '준설공사'
  WHEN '철도ㆍ궤도공사업' THEN '철도궤도공사'
  WHEN '종합국가유산수리업(보수단청업)' THEN '문화재수리공사'
  WHEN '전문국가유산수리업(보존과학업)' THEN '문화재수리공사'
  WHEN '전문국가유산수리업(식물보호업)' THEN '문화재수리공사'
  ELSE NULL
END
`;

const RANGES: { ym: string; start: string; end: string }[] = [
  { ym: "2003-05", start: "2003-05-01", end: "2003-06-01" },
  { ym: "2004-09", start: "2004-09-01", end: "2004-10-01" },
  { ym: "2020-12", start: "2020-12-01", end: "2021-01-01" },
];

async function main() {
  const url = loadDb();
  if (!url) { console.error("DB url 없음"); process.exit(1); }

  const c = new Client({ connectionString: url });
  await c.connect();
  await c.query("SET statement_timeout = 0");
  await c.query("SET lock_timeout = 0");

  console.log(`=== restore-subcats-from-rawjson 시작 ===\n`);

  for (const r of RANGES) {
    const t0 = Date.now();
    const sql = `
      UPDATE "Announcement" a
      SET "subCategories" = (
        SELECT COALESCE(
          array_agg(DISTINCT cat) FILTER (WHERE cat IS NOT NULL AND cat != ''),
          '{}'
        )
        FROM (
          SELECT ${MAPPING} AS cat
          FROM (VALUES
            (a."rawJson"->>'subsiCnsttyNm1'),
            (a."rawJson"->>'subsiCnsttyNm2'),
            (a."rawJson"->>'subsiCnsttyNm3'),
            (a."rawJson"->>'subsiCnsttyNm4'),
            (a."rawJson"->>'subsiCnsttyNm5')
          ) AS t(sub_raw)
          WHERE sub_raw IS NOT NULL AND sub_raw != ''
        ) mapped
      )
      WHERE a."deadline" >= $1::date AND a."deadline" < $2::date
        AND (array_length(a."subCategories", 1) IS NULL OR array_length(a."subCategories", 1) = 0)
        AND a."rawJson"->>'subsiCnsttyNm1' IS NOT NULL
        AND a."rawJson"->>'subsiCnsttyNm1' != ''
    `;
    const res = await c.query(sql, [r.start, r.end]);
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[${r.ym}] 복구 ${res.rowCount}건 (${sec}초)`);

    // 검증: 표본 SELECT
    const sample = await c.query<{ konepsId: string; title: string; subCategories: string[] }>(
      `SELECT "konepsId", title, "subCategories" FROM "Announcement"
       WHERE "deadline" >= $1::date AND "deadline" < $2::date
         AND array_length("subCategories", 1) > 0
       ORDER BY random() LIMIT 3`,
      [r.start, r.end]
    );
    for (const row of sample.rows) {
      console.log(`  ${row.konepsId} | ${row.title.slice(0, 30)} | ${row.subCategories.join(",")}`);
    }
    console.log();
  }

  // 채움율 재측정
  console.log(`=== 복구 후 채움율 ===`);
  for (const r of RANGES) {
    const cnt = await c.query<{ total: string; filled: string; empty: string }>(
      `SELECT COUNT(*)::text AS total,
              SUM(CASE WHEN array_length("subCategories", 1) > 0 THEN 1 ELSE 0 END)::text AS filled,
              SUM(CASE WHEN "subCategories" IS NULL OR array_length("subCategories", 1) IS NULL THEN 1 ELSE 0 END)::text AS empty
       FROM "Announcement"
       WHERE "deadline" >= $1::date AND "deadline" < $2::date`,
      [r.start, r.end]
    );
    const t = parseInt(cnt.rows[0].total);
    const f = parseInt(cnt.rows[0].filled);
    const e = parseInt(cnt.rows[0].empty);
    const pct = t > 0 ? ((e / t) * 100).toFixed(1) : "0.0";
    console.log(`[${r.ym}] total=${t} | filled=${f} | empty=${e} (${pct}%)`);
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
