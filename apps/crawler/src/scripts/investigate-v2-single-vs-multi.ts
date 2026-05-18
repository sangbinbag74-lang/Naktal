/**
 * 박상빈님 5/18 명시 반영 재조사:
 *   1. 단일예가 (prearngPrceDcsnMthdNm="단일예가") 만 분석 제외
 *   2. 수의계약이라도 입찰방식 (복수예가) 이면 분석 대상
 *   3. 2026년 lwlt 89.745% 강제 적용 — G2B 87.745% 응답은 박상빈님 메모리 위반
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

function loadEnv(key: string): string {
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
    // 1. 활성 공고 + 단일예가 vs 복수예가 분리
    console.log("=".repeat(60));
    console.log("1. 활성 공고 (deadline > NOW) — 단일예가 vs 복수예가");
    console.log("=".repeat(60));
    const split = await pool.query(`
      SELECT
        COALESCE("rawJson"->>'prearngPrceDcsnMthdNm','-') AS price_method,
        COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE deadline > NOW()
      GROUP BY price_method
      ORDER BY n DESC
    `);
    let totalActive = 0;
    for (const r of split.rows) totalActive += Number(r.n);
    console.log(`활성 공고 전체: ${totalActive.toLocaleString()}건`);
    for (const r of split.rows) {
      const n = Number(r.n);
      console.log(`  ${r.price_method}: ${n.toLocaleString()}건 (${(n/totalActive*100).toFixed(2)}%)`);
    }

    // 2. bsisAmt=0 활성 공고 — 단일예가 vs 복수예가
    console.log("\n" + "=".repeat(60));
    console.log("2. bsisAmt=0 활성 공고 — 단일예가/복수예가 분리");
    console.log("=".repeat(60));
    const bsisActive = await pool.query(`
      SELECT
        COALESCE("rawJson"->>'prearngPrceDcsnMthdNm','-') AS price_method,
        COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE deadline > NOW() AND "bsisAmt" = 0 AND budget > 0
      GROUP BY price_method
      ORDER BY n DESC
    `);
    for (const r of bsisActive.rows) {
      console.log(`  ${r.price_method}: ${Number(r.n).toLocaleString()}건`);
    }

    // 3. 활성 + 복수예가 + bsisAmt=0 (진짜 누락 = 백필 필요)
    console.log("\n" + "=".repeat(60));
    console.log("3. 진짜 누락 = 활성 + 복수예가 + bsisAmt=0");
    console.log("=".repeat(60));
    const trueLeak = await pool.query(`
      SELECT COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE deadline > NOW() AND "bsisAmt" = 0 AND budget > 0
        AND "rawJson"->>'prearngPrceDcsnMthdNm' IS NOT NULL
        AND "rawJson"->>'prearngPrceDcsnMthdNm' != '단일예가'
        AND "rawJson"->>'prearngPrceDcsnMthdNm' != ''
    `);
    console.log(`진짜 누락 (백필 필요): ${Number(trueLeak.rows[0].n).toLocaleString()}건`);

    // 4. 진짜 누락 — 카테고리별
    const trueLeakCat = await pool.query(`
      SELECT category, COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE deadline > NOW() AND "bsisAmt" = 0 AND budget > 0
        AND "rawJson"->>'prearngPrceDcsnMthdNm' IS NOT NULL
        AND "rawJson"->>'prearngPrceDcsnMthdNm' != '단일예가'
        AND "rawJson"->>'prearngPrceDcsnMthdNm' != ''
      GROUP BY category ORDER BY n DESC LIMIT 10
    `);
    console.log("\n진짜 누락 카테고리:");
    for (const r of trueLeakCat.rows) {
      console.log(`  ${r.category}: ${Number(r.n).toLocaleString()}건`);
    }

    // 5. 진짜 누락 샘플 (백필 대상)
    const trueLeakSample = await pool.query(`
      SELECT "konepsId", title, category, deadline, budget,
             "rawJson"->>'prearngPrceDcsnMthdNm' AS price_method,
             "rawJson"->>'cntrctCnclsMthdNm' AS contract_method
      FROM "Announcement"
      WHERE deadline > NOW() AND "bsisAmt" = 0 AND budget > 0
        AND "rawJson"->>'prearngPrceDcsnMthdNm' IS NOT NULL
        AND "rawJson"->>'prearngPrceDcsnMthdNm' != '단일예가'
        AND "rawJson"->>'prearngPrceDcsnMthdNm' != ''
      ORDER BY deadline ASC LIMIT 8
    `);
    console.log("\n진짜 누락 샘플 (백필 대상):");
    for (const r of trueLeakSample.rows) {
      console.log(`  ${r.konepsId} | ${r.title.slice(0,40)} | budget=${Number(r.budget).toLocaleString()} | price=${r.price_method} | contract=${r.contract_method}`);
    }

    // 6. 87.745% 옛 lwlt — 활성 + 복수예가 (박상빈님 89.745% 위반)
    console.log("\n" + "=".repeat(60));
    console.log("6. 87.745% 옛 lwlt — 활성 + 복수예가 (89.745% 정정 대상)");
    console.log("=".repeat(60));
    const lwltActive = await pool.query(`
      SELECT COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE deadline > NOW()
        AND ABS("sucsfbidLwltRate" - 87.745) < 0.001
        AND "rawJson"->>'prearngPrceDcsnMthdNm' != '단일예가'
    `);
    console.log(`정정 대상: ${Number(lwltActive.rows[0].n).toLocaleString()}건`);

    const lwltActiveCat = await pool.query(`
      SELECT category, COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE deadline > NOW()
        AND ABS("sucsfbidLwltRate" - 87.745) < 0.001
        AND "rawJson"->>'prearngPrceDcsnMthdNm' != '단일예가'
      GROUP BY category ORDER BY n DESC LIMIT 10
    `);
    console.log("\n카테고리별:");
    for (const r of lwltActiveCat.rows) {
      console.log(`  ${r.category}: ${Number(r.n).toLocaleString()}건`);
    }

    // 7. 87.745% 활성 + 복수예가 샘플
    const lwltSample = await pool.query(`
      SELECT "konepsId", title, category, deadline, budget, "bsisAmt",
             "rawJson"->>'prearngPrceDcsnMthdNm' AS price_method,
             "rawJson"->>'sucsfbidLwltRate' AS raw_lwlt
      FROM "Announcement"
      WHERE deadline > NOW()
        AND ABS("sucsfbidLwltRate" - 87.745) < 0.001
        AND "rawJson"->>'prearngPrceDcsnMthdNm' != '단일예가'
      ORDER BY deadline ASC LIMIT 8
    `);
    console.log("\n샘플:");
    for (const r of lwltSample.rows) {
      console.log(`  ${r.konepsId} | ${r.title.slice(0,40)} | bsisAmt=${Number(r.bsisAmt).toLocaleString()} | price=${r.price_method} | rawJson.lwlt=${r.raw_lwlt}`);
    }

    // 8. 2026년 전체 (활성+마감) — 87.745% + 복수예가 정정 대상
    console.log("\n" + "=".repeat(60));
    console.log("8. 2026년 전체 — 87.745% + 복수예가 (89.745% 정정 대상)");
    console.log("=".repeat(60));
    const lwlt2026 = await pool.query(`
      SELECT COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE deadline >= '2026-01-01' AND deadline < '2027-01-01'
        AND ABS("sucsfbidLwltRate" - 87.745) < 0.001
        AND "rawJson"->>'prearngPrceDcsnMthdNm' != '단일예가'
    `);
    console.log(`2026년 정정 대상 (복수예가): ${Number(lwlt2026.rows[0].n).toLocaleString()}건`);

    // 9. 분석 대상 활성 공고 (정상 — 복수예가 + bsisAmt>0 + lwlt 정상)
    console.log("\n" + "=".repeat(60));
    console.log("9. 분석 대상 활성 공고 — 정상 (복수예가 + bsisAmt>0 + lwlt 89.745%)");
    console.log("=".repeat(60));
    const valid = await pool.query(`
      SELECT COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE deadline > NOW()
        AND "rawJson"->>'prearngPrceDcsnMthdNm' != '단일예가'
        AND "rawJson"->>'prearngPrceDcsnMthdNm' != ''
        AND "bsisAmt" > 0
        AND "sucsfbidLwltRate" >= 89.745
    `);
    console.log(`정상 분석 대상: ${Number(valid.rows[0].n).toLocaleString()}건`);

    // 10. 활성 공고 종합 분류
    console.log("\n" + "=".repeat(60));
    console.log("10. 활성 공고 종합 — 분석 가능 vs 분석 제외");
    console.log("=".repeat(60));
    const classify = await pool.query(`
      SELECT
        CASE
          WHEN "rawJson"->>'prearngPrceDcsnMthdNm' = '단일예가' THEN '단일예가 (분석 제외)'
          WHEN "rawJson"->>'prearngPrceDcsnMthdNm' IS NULL OR "rawJson"->>'prearngPrceDcsnMthdNm' = '' THEN '예가 방식 누락'
          WHEN "bsisAmt" = 0 THEN '복수예가 + bsisAmt 누락 (백필 필요)'
          WHEN ABS("sucsfbidLwltRate" - 87.745) < 0.001 THEN '복수예가 + lwlt 옛값 (정정 필요)'
          WHEN "bsisAmt" > 0 AND "sucsfbidLwltRate" >= 89.745 THEN '정상 분석 가능'
          ELSE '기타'
        END AS kind,
        COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE deadline > NOW()
      GROUP BY kind
      ORDER BY n DESC
    `);
    for (const r of classify.rows) {
      console.log(`  ${r.kind}: ${Number(r.n).toLocaleString()}건`);
    }
  } finally {
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
