/**
 * 1) 천안상록골프장 region "공무" → "충남" 정정
 * 2) 비정상 region (17개 정식 시도명 외) 전체 진단 — 정정은 별도 동의 후
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

const VALID_REGIONS = [
  "서울","부산","대구","인천","광주","대전","울산","세종",
  "경기","강원","충북","충남","전북","전남","경북","경남","제주"
];

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    // 1. 천안상록골프장 단건 정정
    const updRes = await p.query(`
      UPDATE "Announcement"
      SET region = '충남'
      WHERE "konepsId" = 'R26BK01499800' AND region <> '충남'
      RETURNING id, title, region
    `);
    console.log(`\n=== 천안상록골프장 region 정정 ===`);
    if (updRes.rows.length > 0) {
      console.log(`  ✓ UPDATE: region "공무" → "${updRes.rows[0].region}"`);
    } else {
      console.log(`  이미 정정됐거나 row 없음.`);
    }

    // 2. 비정상 region 진단
    const abnormal = await p.query(`
      SELECT region, COUNT(*)::int AS cnt
      FROM "Announcement"
      WHERE region IS NOT NULL AND region <> ''
        AND region NOT IN (${VALID_REGIONS.map((_, i) => `$${i + 1}`).join(",")})
      GROUP BY region
      ORDER BY cnt DESC
    `, VALID_REGIONS);
    console.log(`\n=== 비정상 region 값 (정식 17개 시도명 외) ===`);
    console.log(`  총 ${abnormal.rows.length}개 카테고리`);
    let totalAbnormal = 0;
    for (const r of abnormal.rows.slice(0, 30)) {
      console.log(`  "${r.region}": ${r.cnt}건`);
      totalAbnormal += Number(r.cnt);
    }
    if (abnormal.rows.length > 30) {
      const rest = abnormal.rows.slice(30).reduce((s, r) => s + Number(r.cnt), 0);
      console.log(`  ... 나머지 ${abnormal.rows.length - 30}개 카테고리 ${rest}건`);
      totalAbnormal += rest;
    }
    console.log(`  비정상 region 총 ${totalAbnormal}건`);

    // 정상 region 카운트
    const okRes = await p.query(`
      SELECT COUNT(*)::int AS cnt FROM "Announcement"
      WHERE region IN (${VALID_REGIONS.map((_, i) => `$${i + 1}`).join(",")})
    `, VALID_REGIONS);
    const empty = await p.query(`SELECT COUNT(*)::int AS cnt FROM "Announcement" WHERE region IS NULL OR region = ''`);
    console.log(`\n  정상 region: ${okRes.rows[0].cnt.toLocaleString()}건`);
    console.log(`  비어있음: ${empty.rows[0].cnt.toLocaleString()}건`);
  } catch (e) {
    console.error("ERR:", (e as Error).message);
    process.exit(1);
  } finally {
    await p.end();
    process.exit(0);
  }
})();
