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
  const pool = new Pool({ connectionString: loadDatabaseUrl()!, max: 2 });
  const c = await pool.connect();
  try {
    console.log("=== 실제 DB 공고 수 (거짓말 없이) ===\n");

    const total = await c.query(`SELECT COUNT(*)::int AS n FROM "Announcement"`);
    console.log(`1. 전체 Announcement row 수: ${total.rows[0].n.toLocaleString()}`);

    const alive = await c.query(`SELECT COUNT(*)::int AS n FROM "Announcement" WHERE "deletedAt" IS NULL`);
    console.log(`2. 삭제 안 된 (deletedAt NULL): ${alive.rows[0].n.toLocaleString()}`);

    const validDate = await c.query(`
      SELECT COUNT(*)::int AS n
      FROM "Announcement"
      WHERE deadline BETWEEN '2002-01-01' AND '2027-12-31'
    `);
    console.log(`3. 정상 deadline (2002~2027): ${validDate.rows[0].n.toLocaleString()}`);

    const weirdDate = await c.query(`
      SELECT COUNT(*)::int AS n
      FROM "Announcement"
      WHERE deadline > '2100-01-01' OR deadline < '2002-01-01'
    `);
    console.log(`4. 이상한 deadline (2100년+ 또는 2002 이전): ${weirdDate.rows[0].n.toLocaleString()}`);

    const active = await c.query(`
      SELECT COUNT(*)::int AS n
      FROM "Announcement"
      WHERE deadline >= NOW()
        AND deadline < '2100-01-01'
    `);
    console.log(`5. 현재 진행중 (정상 날짜 + 마감 전): ${active.rows[0].n.toLocaleString()}`);

    const activeSisul = await c.query(`
      SELECT COUNT(*)::int AS n
      FROM "Announcement"
      WHERE deadline >= NOW()
        AND deadline < '2100-01-01'
        AND category = '시설공사'
    `);
    console.log(`6. 진행중 시설공사: ${activeSisul.rows[0].n.toLocaleString()}`);

    const activeByYear = await c.query(`
      SELECT EXTRACT(YEAR FROM deadline)::int AS yr, COUNT(*)::int AS n
      FROM "Announcement"
      WHERE deadline >= '2024-01-01' AND deadline < '2100-01-01'
      GROUP BY 1 ORDER BY 1
    `);
    console.log(`\n7. 2024~ 연도별 공고 분포:`);
    for (const r of activeByYear.rows) {
      console.log(`   ${r.yr}: ${r.n.toLocaleString()}`);
    }

    const subCatFilled = await c.query(`
      SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN array_length("subCategories", 1) > 0 THEN 1 ELSE 0 END)::int AS filled
      FROM "Announcement"
      WHERE deadline >= NOW() AND deadline < '2100-01-01'
    `);
    const total2 = subCatFilled.rows[0].total;
    const filled = subCatFilled.rows[0].filled;
    const pct = total2 > 0 ? (filled / total2 * 100).toFixed(2) : "0";
    console.log(`\n8. 진행중 공고 중 subCategories 채워진 것: ${filled.toLocaleString()}/${total2.toLocaleString()} (${pct}%)`);
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch(console.error);
