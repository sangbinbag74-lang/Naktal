/**
 * 시·군 단위 지역제한 데이터가 G2B rawJson 어느 필드에 들어가는지 전수 검색.
 * 검색어: "익산시", "관내", "전주시", "군산시" 등
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const envPath = path.join(__dirname, "..", "..", "..", "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const [k, ...rest] = line.split("=");
    if (k && rest.length > 0 && !process.env[k.trim()]) {
      process.env[k.trim()] = rest.join("=").trim().replace(/^"|"$/g, "");
    }
  }
}
const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
const pool = new Pool({ connectionString: url });

(async () => {
  // 1. rawJson 전체에서 "관내" string 등장 빈도 + 어느 키에
  console.log("=== '관내' 키워드 등장 키 분석 ===");
  const r1 = await pool.query(`
    SELECT key, COUNT(*) AS cnt, MIN(val) AS sample
    FROM (
      SELECT
        jsonb_each_text("rawJson"::jsonb) AS kv,
        ((jsonb_each_text("rawJson"::jsonb)).key) AS key,
        ((jsonb_each_text("rawJson"::jsonb)).value) AS val
      FROM "AnnouncementActive"
      WHERE "rawJson"::text ILIKE '%관내%'
      LIMIT 1000
    ) t
    WHERE val ILIKE '%관내%'
    GROUP BY key
    ORDER BY cnt DESC
    LIMIT 20
  `);
  for (const row of r1.rows) {
    console.log(`  ${row.cnt.toString().padStart(5)} : ${row.key}`);
    console.log(`         예: ${(row.sample ?? "").slice(0, 120)}`);
  }

  // 2. "익산시" 또는 임의 시 단위가 등장하는 키 분석
  console.log("\n=== '시 관내' 또는 '시민' 등 시·군 키워드 등장 ===");
  const r2 = await pool.query(`
    SELECT key, COUNT(*) AS cnt, MIN(val) AS sample
    FROM (
      SELECT
        ((jsonb_each_text("rawJson"::jsonb)).key) AS key,
        ((jsonb_each_text("rawJson"::jsonb)).value) AS val
      FROM "AnnouncementActive"
      WHERE "rawJson"::text ~ '(시 관내|군 관내|구 관내)'
      LIMIT 1000
    ) t
    WHERE val ~ '(시 관내|군 관내|구 관내)'
    GROUP BY key
    ORDER BY cnt DESC
    LIMIT 20
  `);
  for (const row of r2.rows) {
    console.log(`  ${row.cnt.toString().padStart(5)} : ${row.key}`);
    console.log(`         예: ${(row.sample ?? "").slice(0, 120)}`);
  }

  // 3. dminsttNm (수요기관명) 분포 - 시·군 정보 여기 있을 수도
  console.log("\n=== 시·군 단위 dminsttNm 샘플 (활성, '시' 또는 '군' 끝나는 것) ===");
  const r3 = await pool.query(`
    SELECT "rawJson"->>'dminsttNm' AS dminstt, COUNT(*) AS cnt
    FROM "AnnouncementActive"
    WHERE "rawJson"->>'dminsttNm' IS NOT NULL
      AND ("rawJson"->>'dminsttNm' LIKE '%시' OR "rawJson"->>'dminsttNm' LIKE '%군' OR "rawJson"->>'dminsttNm' ~ '%시 ' OR "rawJson"->>'dminsttNm' ~ '%군 ')
    GROUP BY 1
    ORDER BY cnt DESC
    LIMIT 15
  `);
  for (const row of r3.rows) {
    console.log(`  ${row.cnt.toString().padStart(5)} : ${row.dminstt}`);
  }

  // 4. bidPrtcptLmtYn=Y 인 row 의 ALL fields dump (1건만)
  console.log("\n=== bidPrtcptLmtYn=Y 인 rawJson 전체 키·값 1건 ===");
  const r4 = await pool.query(`
    SELECT "rawJson"::text AS rj
    FROM "AnnouncementActive"
    WHERE "rawJson"->>'bidPrtcptLmtYn' = 'Y'
    LIMIT 1
  `);
  if (r4.rows[0]) {
    const raw = JSON.parse(r4.rows[0].rj);
    for (const [k, v] of Object.entries(raw)) {
      const s = String(v ?? "");
      if (s && s !== "N" && s !== "") {
        console.log(`  ${k} = ${s.slice(0, 100)}`);
      }
    }
  }

  await pool.end();
})();
