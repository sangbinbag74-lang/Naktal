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
  const pool = new Pool({ connectionString: loadDatabaseUrl()!, max: 1 });
  const c = await pool.connect();
  try {
    // 1. aValueTotal 연도별 분포
    const r1 = await c.query(`
      SELECT
        EXTRACT(YEAR FROM deadline)::int AS yr,
        COUNT(*)::bigint AS total,
        SUM(CASE WHEN "aValueTotal" > 0 THEN 1 ELSE 0 END)::bigint AS aval_filled,
        SUM(CASE WHEN "bsisAmt" > 0 THEN 1 ELSE 0 END)::bigint AS bsis_filled
      FROM "Announcement"
      WHERE deadline >= '2002-01-01'::timestamptz AND deadline < '2027-01-01'::timestamptz
      GROUP BY EXTRACT(YEAR FROM deadline)
      ORDER BY yr
    `);
    console.log(`=== aValueTotal / bsisAmt 연도별 채움율 ===\n`);
    console.log(`연도 | 전체       | aValueTotal       | bsisAmt`);
    console.log(`---- | ---------- | ----------------- | -----------------`);
    for (const row of r1.rows) {
      const total = Number(row.total);
      const aval = Number(row.aval_filled);
      const bsis = Number(row.bsis_filled);
      const avalPct = total > 0 ? ((aval / total) * 100).toFixed(1) : "0";
      const bsisPct = total > 0 ? ((bsis / total) * 100).toFixed(1) : "0";
      console.log(`${row.yr} | ${total.toString().padStart(10)} | ${aval.toString().padStart(7)} (${avalPct.padStart(4)}%) | ${bsis.toString().padStart(7)} (${bsisPct.padStart(4)}%)`);
    }

    // 2. aValueTotal 있는 행이 category별 분포
    const r2 = await c.query(`
      SELECT category, COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE "aValueTotal" > 0
      GROUP BY category
      ORDER BY n DESC
    `);
    console.log(`\n=== aValueTotal > 0 인 행의 category 분포 ===`);
    for (const row of r2.rows) {
      console.log(`  ${row.category}: ${Number(row.n).toLocaleString()}`);
    }

    // 3. 가장 오래된 / 최근 aValueTotal 공고
    const r3 = await c.query(`
      SELECT MIN(deadline) AS oldest, MAX(deadline) AS newest
      FROM "Announcement" WHERE "aValueTotal" > 0
    `);
    console.log(`\n=== aValueTotal 범위 ===`);
    console.log(`  최초: ${r3.rows[0].oldest}`);
    console.log(`  최근: ${r3.rows[0].newest}`);
  } finally {
    c.release();
    await pool.end();
  }
}
main().catch(console.error);
