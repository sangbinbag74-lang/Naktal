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
    // 1. 공사 공고 전체 vs A값 대상 vs A값 세부금액 존재
    const r1 = await c.query(`
      SELECT
        COUNT(*)::bigint AS total_cnstwk,
        SUM(CASE WHEN "aValueYn" = 'Y' THEN 1 ELSE 0 END)::bigint AS yn_y,
        SUM(CASE WHEN "aValueYn" = 'N' THEN 1 ELSE 0 END)::bigint AS yn_n,
        SUM(CASE WHEN "aValueYn" = '' THEN 1 ELSE 0 END)::bigint AS yn_empty,
        SUM(CASE WHEN "aValueTotal" > 0 THEN 1 ELSE 0 END)::bigint AS total_gt0,
        SUM(CASE WHEN "aValueTotal" = 0 AND "aValueYn" = 'Y' THEN 1 ELSE 0 END)::bigint AS y_but_zero
      FROM "Announcement"
      WHERE category LIKE '%공사%' OR category = '시설공사'
    `);
    const x = r1.rows[0];
    const total = Number(x.total_cnstwk);
    const pct = (n: string | number) => total > 0 ? ((Number(n) / total) * 100).toFixed(2) : "0";
    console.log(`=== 공사 공고 A값 타당성 분석 ===\n`);
    console.log(`공사 공고 전체        : ${total.toLocaleString()}`);
    console.log(`  aValueYn = 'Y'      : ${Number(x.yn_y).toLocaleString()} (${pct(x.yn_y)}%) ← A값 대상`);
    console.log(`  aValueYn = 'N'      : ${Number(x.yn_n).toLocaleString()} (${pct(x.yn_n)}%) ← 대상 아님`);
    console.log(`  aValueYn = ''       : ${Number(x.yn_empty).toLocaleString()} (${pct(x.yn_empty)}%) ← 미수집/미처리`);
    console.log(`  aValueTotal > 0     : ${Number(x.total_gt0).toLocaleString()} (${pct(x.total_gt0)}%) ← 세부금액 있음`);
    console.log(`  Y지만 금액=0       : ${Number(x.y_but_zero).toLocaleString()} (${pct(x.y_but_zero)}%) ← A값 대상이지만 API 응답에 금액 누락`);

    // 2. 공사 공고 aValueYn='Y' 중 세부금액 채움율
    const r2 = await c.query(`
      SELECT
        COUNT(*)::bigint AS y_total,
        SUM(CASE WHEN "aValueTotal" > 0 THEN 1 ELSE 0 END)::bigint AS y_with_amt
      FROM "Announcement"
      WHERE (category LIKE '%공사%' OR category = '시설공사')
        AND "aValueYn" = 'Y'
    `);
    const y = r2.rows[0];
    const yT = Number(y.y_total);
    const yA = Number(y.y_with_amt);
    console.log(`\n[A값 대상(Y) 중 세부금액 실제 있는 비율]`);
    console.log(`  ${yA.toLocaleString()} / ${yT.toLocaleString()} = ${yT > 0 ? ((yA / yT) * 100).toFixed(2) : 0}%`);
    console.log(`  → 나머지 ${(yT - yA).toLocaleString()}건은 G2B가 세부금액 제공 안 함`);

    // 3. 연도별 aValueYn Y 비율 (이게 업계 표준과 맞는지)
    const r3 = await c.query(`
      SELECT
        EXTRACT(YEAR FROM deadline)::int AS yr,
        COUNT(*)::bigint AS total,
        SUM(CASE WHEN "aValueYn" = 'Y' THEN 1 ELSE 0 END)::bigint AS y,
        SUM(CASE WHEN "aValueTotal" > 0 THEN 1 ELSE 0 END)::bigint AS amt_filled
      FROM "Announcement"
      WHERE (category LIKE '%공사%' OR category = '시설공사')
        AND deadline >= '2005-01-01'
        AND deadline < '2026-01-01'
      GROUP BY yr
      ORDER BY yr
    `);
    console.log(`\n[공사 공고 연도별 A값 Y 비율]`);
    console.log(`연도 | 공사수      | Y(대상)    | 금액있음`);
    for (const row of r3.rows) {
      const t = Number(row.total);
      const yc = Number(row.y);
      const amt = Number(row.amt_filled);
      const yPct = t > 0 ? ((yc / t) * 100).toFixed(1) : "0";
      const amtPct = t > 0 ? ((amt / t) * 100).toFixed(1) : "0";
      console.log(`${row.yr} | ${t.toString().padStart(9)} | ${yc.toString().padStart(6)} (${yPct.padStart(4)}%) | ${amt.toString().padStart(6)} (${amtPct.padStart(4)}%)`);
    }

    // 4. 예산 규모별 A값 비율 (대형 공사일수록 A값 있어야 함)
    const r4 = await c.query(`
      SELECT
        CASE
          WHEN budget < 100000000 THEN '1억 미만'
          WHEN budget < 1000000000 THEN '1~10억'
          WHEN budget < 5000000000 THEN '10~50억'
          WHEN budget < 10000000000 THEN '50~100억'
          ELSE '100억+'
        END AS budget_range,
        COUNT(*)::bigint AS n,
        SUM(CASE WHEN "aValueYn" = 'Y' THEN 1 ELSE 0 END)::bigint AS y,
        SUM(CASE WHEN "aValueTotal" > 0 THEN 1 ELSE 0 END)::bigint AS amt
      FROM "Announcement"
      WHERE (category LIKE '%공사%' OR category = '시설공사')
      GROUP BY budget_range
      ORDER BY MIN(budget)
    `);
    console.log(`\n[공사 공고 예산 규모별 A값 Y 비율]`);
    console.log(`예산범위       | 공고수       | Y(대상)    | 금액있음`);
    for (const row of r4.rows) {
      const t = Number(row.n);
      const yc = Number(row.y);
      const amt = Number(row.amt);
      const yPct = t > 0 ? ((yc / t) * 100).toFixed(1) : "0";
      const amtPct = t > 0 ? ((amt / t) * 100).toFixed(1) : "0";
      console.log(`${(row.budget_range as string).padEnd(14)} | ${t.toString().padStart(10)} | ${yc.toString().padStart(6)} (${yPct.padStart(4)}%) | ${amt.toString().padStart(6)} (${amtPct.padStart(4)}%)`);
    }

    // 5. aValueDetails 있는 샘플 1개 확인
    const r5 = await c.query(`
      SELECT "konepsId", title, "aValueTotal", "aValueDetails"
      FROM "Announcement"
      WHERE "aValueTotal" > 0
      ORDER BY "aValueTotal" DESC
      LIMIT 2
    `);
    console.log(`\n[최상위 A값 샘플]`);
    for (const row of r5.rows) {
      console.log(`  ${row.konepsId}: ${row.aValueTotal}원 | ${row.title.slice(0, 50)}`);
      console.log(`    ${JSON.stringify(row.aValueDetails)}`);
    }
  } finally {
    c.release();
    await pool.end();
  }
}
main().catch(console.error);
