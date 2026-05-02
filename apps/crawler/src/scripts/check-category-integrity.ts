/**
 * 카테고리 분류 정확성 정밀 진단
 * rawJson 내 mainCnsttyNm, pubPrcrmntMidClsfcNm 등 분포 확인
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadDatabaseUrl(): string | undefined {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  try {
    const c = fs.readFileSync(rootEnv, "utf-8");
    for (const l of c.split("\n")) {
      const t = l.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k === "DATABASE_URL" && v && !v.includes("[YOUR-PASSWORD]")) return v;
    }
  } catch {}
  return process.env.DATABASE_URL;
}

async function main() {
  const url = loadDatabaseUrl();
  const pool = new Pool({ connectionString: url!, max: 2 });
  const c = await pool.connect();
  try {
    console.log("=== 1. 시설공사 카테고리 내 mainCnsttyNm 분포 (상위 40) ===");
    const r1 = await c.query(`
      SELECT "rawJson"->>'mainCnsttyNm' AS main, COUNT(*)::int AS cnt
      FROM "Announcement"
      WHERE category = '시설공사'
      GROUP BY 1 ORDER BY 2 DESC LIMIT 40
    `);
    for (const r of r1.rows) console.log(`  '${r.main ?? "(null)"}': ${r.cnt.toLocaleString()}`);

    console.log("\n=== 2. 조경 관련 mainCnsttyNm 값 탐색 ===");
    const r2 = await c.query(`
      SELECT "rawJson"->>'mainCnsttyNm' AS main, COUNT(*)::int AS cnt
      FROM "Announcement"
      WHERE "rawJson"->>'mainCnsttyNm' ILIKE '%조경%'
      GROUP BY 1 ORDER BY 2 DESC LIMIT 20
    `);
    for (const r of r2.rows) console.log(`  '${r.main}': ${r.cnt.toLocaleString()}`);

    console.log("\n=== 3. 시설공사 이면서 조경 관련 공고 실제 건수 ===");
    const r3 = await c.query(`
      SELECT COUNT(*)::int AS cnt, "rawJson"->>'mainCnsttyNm' AS main
      FROM "Announcement"
      WHERE category = '시설공사'
        AND "rawJson"->>'mainCnsttyNm' ILIKE '%조경%'
      GROUP BY 2 ORDER BY 1 DESC
    `);
    for (const r of r3.rows) console.log(`  '${r.main}': ${r.cnt.toLocaleString()}`);

    console.log("\n=== 4. 조경 관련 공고 전체 (카테고리 + rawJson 통합) ===");
    const r4 = await c.query(`
      SELECT
        SUM(CASE WHEN category ILIKE '%조경%' THEN 1 ELSE 0 END)::int AS cat_based,
        SUM(CASE WHEN "rawJson"->>'mainCnsttyNm' ILIKE '%조경%' THEN 1 ELSE 0 END)::int AS raw_based,
        SUM(CASE WHEN category ILIKE '%조경%' OR "rawJson"->>'mainCnsttyNm' ILIKE '%조경%' THEN 1 ELSE 0 END)::int AS union_based
      FROM "Announcement"
    `);
    console.log(r4.rows[0]);

    console.log("\n=== 5. subCategories 활용도 (공사 공고에서) ===");
    const r5 = await c.query(`
      SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN array_length("subCategories", 1) > 0 THEN 1 ELSE 0 END)::int AS has_subcat,
        SUM(CASE WHEN '조경시설물공사' = ANY("subCategories") THEN 1 ELSE 0 END)::int AS has_jokyeong_sisul
      FROM "Announcement"
      WHERE category = '시설공사'
    `);
    console.log(r5.rows[0]);
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch(console.error);
