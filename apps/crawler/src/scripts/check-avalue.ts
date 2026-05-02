import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadDatabaseUrl(): string | undefined {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  try {
    const content = fs.readFileSync(rootEnv, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (key === "DATABASE_URL" && val && !val.includes("[YOUR-PASSWORD]")) return val;
    }
  } catch {}
  return process.env.DATABASE_URL;
}

async function main() {
  const url = loadDatabaseUrl();
  const pool = new Pool({ connectionString: url!, max: 2 });
  const c = await pool.connect();
  try {
    console.log("=== A값 필드 상태 조사 ===\n");

    console.log("1. Announcement 테이블 A값 분포:");
    const r1 = await c.query(`
      SELECT
        COUNT(*)::int AS 총공고,
        SUM(CASE WHEN "aValueAmt"::bigint > 0 THEN 1 ELSE 0 END)::int AS aValueAmt_양수,
        SUM(CASE WHEN "aValueTotal"::bigint > 0 THEN 1 ELSE 0 END)::int AS aValueTotal_양수,
        SUM(CASE WHEN "aValueYn" = 'Y' THEN 1 ELSE 0 END)::int AS aValueYn_Y
      FROM "Announcement"
    `);
    console.log(r1.rows[0]);

    console.log("\n2. 카테고리별 A값 있는 공고 수 (상위 10):");
    const r2 = await c.query(`
      SELECT category,
        COUNT(*)::int AS total,
        SUM(CASE WHEN "aValueAmt"::bigint > 0 THEN 1 ELSE 0 END)::int AS with_avalue_amt,
        SUM(CASE WHEN "aValueTotal"::bigint > 0 THEN 1 ELSE 0 END)::int AS with_avalue_total
      FROM "Announcement"
      GROUP BY 1
      ORDER BY total DESC
      LIMIT 10
    `);
    for (const r of r2.rows) console.log(r);

    console.log("\n3. 시설공사 공고 샘플 (A값 확인):");
    const r3 = await c.query(`
      SELECT "konepsId", title, budget::bigint, "aValueAmt"::bigint, "aValueTotal"::bigint, "aValueYn"
      FROM "Announcement"
      WHERE category = '시설공사' OR category ILIKE '%공사%'
      LIMIT 5
    `);
    for (const r of r3.rows) console.log(r);

    console.log("\n4. aValueYn='Y'인 공고 샘플:");
    const r4 = await c.query(`
      SELECT "konepsId", title, category, budget::bigint, "aValueAmt"::bigint, "aValueTotal"::bigint, "aValueYn"
      FROM "Announcement"
      WHERE "aValueYn" = 'Y'
      LIMIT 10
    `);
    console.log(`총 ${r4.rows.length}건 표시:`);
    for (const r of r4.rows) console.log(r);

    console.log("\n5. BidResult ⋈ Announcement 중 A값 있는 것:");
    const r5 = await c.query(`
      SELECT
        COUNT(*)::int AS 총행,
        SUM(CASE WHEN a."aValueAmt"::bigint > 0 THEN 1 ELSE 0 END)::int AS aValueAmt_양수,
        SUM(CASE WHEN a."aValueTotal"::bigint > 0 THEN 1 ELSE 0 END)::int AS aValueTotal_양수,
        SUM(CASE WHEN a."aValueYn" = 'Y' THEN 1 ELSE 0 END)::int AS aValueYn_Y
      FROM "BidResult" b
      JOIN "Announcement" a ON a."konepsId" = b."annId"
    `);
    console.log(r5.rows[0]);
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch(console.error);
