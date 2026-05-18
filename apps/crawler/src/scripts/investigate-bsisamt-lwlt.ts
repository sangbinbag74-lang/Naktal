/**
 * bsisAmt 누락 + sucsfbidLwltRate 옛값 전수 조사
 * 박상빈님 5/18 명시: 107.515% 이상값 원인 조사
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

function loadEnv(key: "DIRECT_URL"): string {
  const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
  for (const l of env.split("\n")) {
    if (l.startsWith(`${key}=`)) {
      return l.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
    }
  }
  throw new Error(`${key} 없음`);
}

(async () => {
  const pool = new Pool({ connectionString: loadEnv("DIRECT_URL"), max: 1 });
  try {
    // 1. 전체 Announcement 개수
    const total = await pool.query(`SELECT COUNT(*)::bigint AS n FROM "Announcement"`);
    console.log(`전체 Announcement: ${Number(total.rows[0].n).toLocaleString()}건\n`);

    // 2. bsisAmt 누락 전체
    console.log("=".repeat(60));
    console.log("A. bsisAmt 누락 (=0) 조사");
    console.log("=".repeat(60));
    const bsisAll = await pool.query(`
      SELECT COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE "bsisAmt" = 0 AND budget > 0
    `);
    console.log(`bsisAmt=0 + budget>0 전체: ${Number(bsisAll.rows[0].n).toLocaleString()}건`);

    // 3. bsisAmt 누락 — 2026년 deadline 공고 (운영 중)
    const bsis2026 = await pool.query(`
      SELECT COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE "bsisAmt" = 0 AND budget > 0
        AND deadline >= '2026-01-01' AND deadline < '2027-01-01'
    `);
    console.log(`bsisAmt=0 + 2026년 deadline: ${Number(bsis2026.rows[0].n).toLocaleString()}건`);

    // 4. bsisAmt 누락 — 활성 공고 (deadline > NOW)
    const bsisActive = await pool.query(`
      SELECT COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE "bsisAmt" = 0 AND budget > 0 AND deadline > NOW()
    `);
    console.log(`bsisAmt=0 + 활성(deadline>NOW): ${Number(bsisActive.rows[0].n).toLocaleString()}건`);

    // 5. 카테고리별 분포 (2026년)
    const byCategory2026 = await pool.query(`
      SELECT category, COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE "bsisAmt" = 0 AND budget > 0
        AND deadline >= '2026-01-01' AND deadline < '2027-01-01'
      GROUP BY category ORDER BY n DESC LIMIT 15
    `);
    console.log("\nbsisAmt=0 카테고리별 분포 (2026년):");
    for (const r of byCategory2026.rows) {
      console.log(`  ${r.category}: ${Number(r.n).toLocaleString()}건`);
    }

    // 6. 월별 분포 (2026년)
    const byMonth2026 = await pool.query(`
      SELECT TO_CHAR(deadline, 'YYYY-MM') AS ym, COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE "bsisAmt" = 0 AND budget > 0
        AND deadline >= '2026-01-01' AND deadline < '2027-01-01'
      GROUP BY ym ORDER BY ym
    `);
    console.log("\nbsisAmt=0 월별 분포 (2026년):");
    for (const r of byMonth2026.rows) {
      console.log(`  ${r.ym}: ${Number(r.n).toLocaleString()}건`);
    }

    // 7. sucsfbidLwltRate 옛 2025 값 조사
    console.log("\n" + "=".repeat(60));
    console.log("B. sucsfbidLwltRate 옛 2025 비율(87.745%) 조사");
    console.log("=".repeat(60));

    const lwltAll = await pool.query(`
      SELECT "sucsfbidLwltRate"::numeric AS rate, COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE "sucsfbidLwltRate" > 0
        AND deadline >= '2026-01-01' AND deadline < '2027-01-01'
      GROUP BY rate ORDER BY n DESC LIMIT 20
    `);
    console.log("sucsfbidLwltRate 분포 (2026년 deadline):");
    let total2026Lwlt = 0;
    let oldRate2026 = 0;
    for (const r of lwltAll.rows) {
      const rate = Number(r.rate);
      const n = Number(r.n);
      total2026Lwlt += n;
      if (Math.abs(rate - 87.745) < 0.001) oldRate2026 += n;
      console.log(`  ${rate.toFixed(3)}%: ${n.toLocaleString()}건`);
    }
    console.log(`\n  [총계] 2026년 + sucsfbidLwltRate>0: ${total2026Lwlt.toLocaleString()}건`);
    console.log(`  [옛 87.745%]: ${oldRate2026.toLocaleString()}건 (${(oldRate2026 / total2026Lwlt * 100).toFixed(2)}%)`);

    // 8. 87.745% 옛값 — 2026년 활성 공고
    const oldLwltActive = await pool.query(`
      SELECT COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE ABS("sucsfbidLwltRate" - 87.745) < 0.001
        AND deadline > NOW()
    `);
    console.log(`  [활성 + 87.745%]: ${Number(oldLwltActive.rows[0].n).toLocaleString()}건`);

    // 9. 87.745% 옛값 — 카테고리별
    const oldLwltCat = await pool.query(`
      SELECT category, COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE ABS("sucsfbidLwltRate" - 87.745) < 0.001
        AND deadline >= '2026-01-01' AND deadline < '2027-01-01'
      GROUP BY category ORDER BY n DESC LIMIT 10
    `);
    console.log("\n  [87.745% 카테고리별 (2026년)]:");
    for (const r of oldLwltCat.rows) {
      console.log(`    ${r.category}: ${Number(r.n).toLocaleString()}건`);
    }

    // 10. 87.745% + 활성 공고 샘플
    const oldLwltSamples = await pool.query(`
      SELECT "konepsId", title, category, deadline, "bsisAmt", budget, "sucsfbidLwltRate"
      FROM "Announcement"
      WHERE ABS("sucsfbidLwltRate" - 87.745) < 0.001
        AND deadline > NOW()
      ORDER BY deadline ASC LIMIT 10
    `);
    console.log("\n  [87.745% 활성 공고 샘플]:");
    for (const r of oldLwltSamples.rows) {
      console.log(`    ${r.konepsId} | ${r.title.slice(0,40)} | deadline=${r.deadline.toISOString().slice(0,10)} | bsisAmt=${Number(r.bsisAmt).toLocaleString()} | budget=${Number(r.budget).toLocaleString()}`);
    }

    // 11. rsrvtnPrceRngBgnRate = 0 누락 (2026년)
    console.log("\n" + "=".repeat(60));
    console.log("C. rsrvtnPrceRngBgnRate = 0 누락 조사");
    console.log("=".repeat(60));
    const rngZero = await pool.query(`
      SELECT COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE "rsrvtnPrceRngBgnRate" = 0 AND "rsrvtnPrceRngEndRate" = 0
        AND deadline >= '2026-01-01' AND deadline < '2027-01-01'
    `);
    console.log(`rsrvtnPrceRngBgn/EndRate=0 (2026년): ${Number(rngZero.rows[0].n).toLocaleString()}건`);

    // 12. 누락 3개 동시 (bsisAmt=0 + lwlt=87.745 + rngRate=0)
    console.log("\n" + "=".repeat(60));
    console.log("D. 3개 모두 누락/이상 (bsisAmt=0 + lwlt=87.745 + rngRate=0)");
    console.log("=".repeat(60));
    const allMissing = await pool.query(`
      SELECT COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE "bsisAmt" = 0 AND budget > 0
        AND ABS("sucsfbidLwltRate" - 87.745) < 0.001
        AND "rsrvtnPrceRngBgnRate" = 0
        AND deadline >= '2026-01-01' AND deadline < '2027-01-01'
    `);
    console.log(`3개 모두 이상 (2026년): ${Number(allMissing.rows[0].n).toLocaleString()}건`);

  } finally {
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
