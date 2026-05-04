/**
 * 빈 subCategories 행의 rawJson 키 분석
 * - subsiCnsttyNm1 보유 비율
 * - mainCnsttyNm 보유 비율
 * - bidNtceNo 등으로 op 종류 추정
 */
import { Client } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadDb(): string {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(rootEnv, "utf-8");
  for (const l of c.split("\n")) {
    const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i === -1) continue;
    const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "DATABASE_URL" && v && !v.includes("[YOUR-PASSWORD]")) return v;
  }
  return "";
}

const RANGES = [
  { ym: "2003-05", start: "2003-05-01", end: "2003-06-01" },
  { ym: "2004-09", start: "2004-09-01", end: "2004-10-01" },
  { ym: "2020-12", start: "2020-12-01", end: "2021-01-01" },
];

interface KeyCnt { has_subsi: string; has_main: string; has_bidNtceNo: string; total: string }

(async () => {
  const c = new Client({ connectionString: loadDb() });
  await c.connect();

  for (const r of RANGES) {
    console.log(`\n=== ${r.ym} 빈 subCategories 행 진단 ===`);
    const k = await c.query<KeyCnt>(
      `SELECT
         COUNT(*)::text AS total,
         SUM(CASE WHEN "rawJson" ? 'subsiCnsttyNm1' AND "rawJson"->>'subsiCnsttyNm1' != '' THEN 1 ELSE 0 END)::text AS has_subsi,
         SUM(CASE WHEN "rawJson" ? 'mainCnsttyNm' AND "rawJson"->>'mainCnsttyNm' != '' THEN 1 ELSE 0 END)::text AS has_main,
         SUM(CASE WHEN "rawJson" ? 'bidNtceNo' THEN 1 ELSE 0 END)::text AS has_bidNtceNo
       FROM "Announcement"
       WHERE "deadline" >= $1::date AND "deadline" < $2::date
         AND (array_length("subCategories", 1) IS NULL OR array_length("subCategories", 1) = 0)`,
      [r.start, r.end]
    );
    const row = k.rows[0];
    console.log(`  빈 행 total=${row.total}, subsiCnsttyNm1 보유=${row.has_subsi}, mainCnsttyNm 보유=${row.has_main}, bidNtceNo 보유=${row.has_bidNtceNo}`);

    const sample = await c.query<{ konepsId: string; category: string; rawkeys: string }>(
      `SELECT "konepsId", category,
              (SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys("rawJson") AS k WHERE k LIKE '%Cnstty%' OR k LIKE '%Kind%' OR k LIKE '%Clsfc%' OR k = 'bidNtceNo' OR k = 'pubPrcrmntKindNm') AS rawkeys
       FROM "Announcement"
       WHERE "deadline" >= $1::date AND "deadline" < $2::date
         AND (array_length("subCategories", 1) IS NULL OR array_length("subCategories", 1) = 0)
       ORDER BY random() LIMIT 5`,
      [r.start, r.end]
    );
    console.log(`  표본 5건:`);
    for (const s of sample.rows) {
      console.log(`    ${s.konepsId} | cat=${s.category} | keys=${s.rawkeys}`);
    }
  }

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
