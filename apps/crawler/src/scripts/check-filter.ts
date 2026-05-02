/**
 * 특정 카테고리/지역 필터로 실제 DB에 데이터가 있는지 확인
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadDatabaseUrl(): string | undefined {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  try {
    const content = fs.readFileSync(rootEnv, "utf-8");
    for (const line of content.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eqIdx = t.indexOf("=");
      if (eqIdx === -1) continue;
      const k = t.slice(0, eqIdx).trim();
      const v = t.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
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
    console.log("=== 카테고리 분포 (상위 30) ===");
    const cats = await c.query(`
      SELECT category, COUNT(*)::int AS cnt
      FROM "Announcement"
      GROUP BY 1 ORDER BY 2 DESC LIMIT 30
    `);
    for (const r of cats.rows) console.log(`  ${r.category}: ${r.cnt.toLocaleString()}`);

    console.log("\n=== '조경' 관련 카테고리 ===");
    const cho = await c.query(`
      SELECT category, COUNT(*)::int AS cnt
      FROM "Announcement"
      WHERE category ILIKE '%조경%'
      GROUP BY 1 ORDER BY 2 DESC
    `);
    for (const r of cho.rows) console.log(`  ${r.category}: ${r.cnt.toLocaleString()}`);

    console.log("\n=== region 분포 (전북 관련) ===");
    const reg = await c.query(`
      SELECT region, COUNT(*)::int AS cnt
      FROM "Announcement"
      WHERE region ILIKE '%전북%' OR region ILIKE '%전라북%'
      GROUP BY 1 ORDER BY 2 DESC LIMIT 20
    `);
    for (const r of reg.rows) console.log(`  '${r.region}': ${r.cnt.toLocaleString()}`);

    console.log("\n=== region 전체 상위 30 ===");
    const allReg = await c.query(`
      SELECT region, COUNT(*)::int AS cnt
      FROM "Announcement"
      GROUP BY 1 ORDER BY 2 DESC LIMIT 30
    `);
    for (const r of allReg.rows) console.log(`  '${r.region}': ${r.cnt.toLocaleString()}`);

    console.log("\n=== 조경 + 전북 active 공고 ===");
    const result = await c.query(`
      SELECT COUNT(*)::int AS cnt
      FROM "Announcement"
      WHERE category IN ('조경시설물공사', '조경식재공사')
        AND region = '전북'
        AND deadline >= NOW()
    `);
    console.log(`  조경 카테고리 + region='전북' + active: ${result.rows[0].cnt}`);

    const result2 = await c.query(`
      SELECT COUNT(*)::int AS cnt
      FROM "Announcement"
      WHERE category IN ('조경시설물공사', '조경식재공사')
        AND region = '전북'
    `);
    console.log(`  조경 카테고리 + region='전북' (전체): ${result2.rows[0].cnt}`);

    const result3 = await c.query(`
      SELECT COUNT(*)::int AS cnt
      FROM "Announcement"
      WHERE category IN ('조경시설물공사', '조경식재공사')
    `);
    console.log(`  조경 카테고리 (전체): ${result3.rows[0].cnt}`);
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch(console.error);
