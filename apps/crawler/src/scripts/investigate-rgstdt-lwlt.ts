/**
 * 박상빈님 5/18 명시: 87.745% lwlt 활성/2026년 공고 등록일(rgstDt) 분포 조사
 *
 * 외부 자료: 2026.1.30 이후 입찰 공고분부터 89.745% 적용
 * → 87.745% lwlt 가 정상 (등록일 < 2026.1.30) vs 잘못된 값 (등록일 ≥ 2026.1.30)
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
    // 1. 87.745% 활성 공고 — 등록일(rgstDt) 분포
    console.log("=".repeat(70));
    console.log("1. 87.745% lwlt 활성 + 복수예가 — 등록일 vs 2026.1.30 기준");
    console.log("=".repeat(70));
    const rgstSplit = await pool.query(`
      SELECT
        CASE
          WHEN ("rawJson"->>'rgstDt')::timestamp < '2026-01-30' THEN '등록 < 2026.1.30 (옛 비율 정상)'
          WHEN ("rawJson"->>'rgstDt')::timestamp >= '2026-01-30' THEN '등록 ≥ 2026.1.30 (정정 필요)'
          ELSE 'rgstDt 누락/파싱불가'
        END AS rgst_kind,
        COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE deadline > NOW()
        AND ABS("sucsfbidLwltRate" - 87.745) < 0.001
        AND "rawJson"->>'prearngPrceDcsnMthdNm' = '복수예가'
      GROUP BY rgst_kind
      ORDER BY n DESC
    `);
    for (const r of rgstSplit.rows) {
      console.log(`  ${r.rgst_kind}: ${Number(r.n).toLocaleString()}건`);
    }

    // 2. 2026년 전체 87.745% — 등록일 분포
    console.log("\n" + "=".repeat(70));
    console.log("2. 2026년 deadline + 87.745% + 복수예가 — 등록일 분포");
    console.log("=".repeat(70));
    const rgst2026 = await pool.query(`
      SELECT
        CASE
          WHEN ("rawJson"->>'rgstDt')::timestamp < '2026-01-30' THEN '등록 < 2026.1.30 (옛 비율 정상)'
          WHEN ("rawJson"->>'rgstDt')::timestamp >= '2026-01-30' THEN '등록 ≥ 2026.1.30 (정정 필요)'
          ELSE 'rgstDt 누락/파싱불가'
        END AS rgst_kind,
        COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE deadline >= '2026-01-01' AND deadline < '2027-01-01'
        AND ABS("sucsfbidLwltRate" - 87.745) < 0.001
        AND "rawJson"->>'prearngPrceDcsnMthdNm' = '복수예가'
      GROUP BY rgst_kind
      ORDER BY n DESC
    `);
    for (const r of rgst2026.rows) {
      console.log(`  ${r.rgst_kind}: ${Number(r.n).toLocaleString()}건`);
    }

    // 3. 카테고리별 lwlt 분포 (2026년 + 복수예가 + 시설공사)
    console.log("\n" + "=".repeat(70));
    console.log("3. 카테고리별 lwlt 분포 (2026년 + 복수예가)");
    console.log("=".repeat(70));
    const catLwlt = await pool.query(`
      SELECT
        category,
        "sucsfbidLwltRate"::numeric AS lwlt,
        COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE deadline >= '2026-01-01' AND deadline < '2027-01-01'
        AND "rawJson"->>'prearngPrceDcsnMthdNm' = '복수예가'
        AND "sucsfbidLwltRate" > 0
      GROUP BY category, lwlt
      HAVING COUNT(*) > 100
      ORDER BY category, lwlt DESC
    `);
    let curCat = "";
    for (const r of catLwlt.rows) {
      if (r.category !== curCat) {
        console.log(`\n  [${r.category}]`);
        curCat = r.category;
      }
      console.log(`    ${Number(r.lwlt).toFixed(3)}%: ${Number(r.n).toLocaleString()}건`);
    }

    // 4. 시설공사 + 87.745% 활성 — 예산 구간 분포
    console.log("\n" + "=".repeat(70));
    console.log("4. 시설공사 + 87.745% 활성 — 예산 구간 분포");
    console.log("=".repeat(70));
    const budgetRange = await pool.query(`
      SELECT
        CASE
          WHEN budget < 1000000000  THEN '< 10억 (89.745 적용)'
          WHEN budget < 5000000000  THEN '10억 ~ 50억 (88.745 적용)'
          WHEN budget < 10000000000 THEN '50억 ~ 100억 (87.495 적용)'
          WHEN budget < 30000000000 THEN '100억 ~ 300억 (81.995 적용)'
          ELSE '300억 이상'
        END AS bud_range,
        COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE deadline > NOW()
        AND ABS("sucsfbidLwltRate" - 87.745) < 0.001
        AND "rawJson"->>'prearngPrceDcsnMthdNm' = '복수예가'
        AND (category LIKE '%시설공사%' OR category LIKE '%토목%' OR category LIKE '%조경%')
      GROUP BY bud_range
      ORDER BY n DESC
    `);
    for (const r of budgetRange.rows) {
      console.log(`  ${r.bud_range}: ${Number(r.n).toLocaleString()}건`);
    }

    // 5. F1' 정정 대상 — 시설공사+87.745%+등록 ≥ 2026.1.30
    console.log("\n" + "=".repeat(70));
    console.log("5. F1' 진짜 정정 대상 (시설공사 + 87.745% + 등록 ≥ 2026.1.30)");
    console.log("=".repeat(70));
    const trueFix = await pool.query(`
      SELECT
        CASE
          WHEN budget < 1000000000  THEN '< 10억 → 89.745%'
          WHEN budget < 5000000000  THEN '10억~50억 → 88.745%'
          WHEN budget < 10000000000 THEN '50억~100억 → 87.495%'
          WHEN budget < 30000000000 THEN '100억~300억 → 81.995%'
          ELSE '300억 이상'
        END AS bud_range,
        COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE deadline >= '2026-01-01' AND deadline < '2027-01-01'
        AND ABS("sucsfbidLwltRate" - 87.745) < 0.001
        AND "rawJson"->>'prearngPrceDcsnMthdNm' = '복수예가'
        AND (category LIKE '%시설공사%' OR category LIKE '%토목%' OR category LIKE '%조경%')
        AND ("rawJson"->>'rgstDt')::timestamp >= '2026-01-30'
      GROUP BY bud_range
      ORDER BY n DESC
    `);
    let totalFix = 0;
    for (const r of trueFix.rows) {
      const n = Number(r.n);
      totalFix += n;
      console.log(`  ${r.bud_range}: ${n.toLocaleString()}건`);
    }
    console.log(`  [합계 정정 대상]: ${totalFix.toLocaleString()}건`);

    // 6. 다른 카테고리 (용역/물품 등) + 87.745% — 등록일 분포
    console.log("\n" + "=".repeat(70));
    console.log("6. 비시설공사 카테고리 + 87.745% (정정 대상 아닐 수 있음)");
    console.log("=".repeat(70));
    const otherCat = await pool.query(`
      SELECT category, COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE deadline >= '2026-01-01' AND deadline < '2027-01-01'
        AND ABS("sucsfbidLwltRate" - 87.745) < 0.001
        AND "rawJson"->>'prearngPrceDcsnMthdNm' = '복수예가'
        AND category NOT LIKE '%시설공사%'
        AND category NOT LIKE '%토목%'
        AND category NOT LIKE '%조경%'
      GROUP BY category
      ORDER BY n DESC LIMIT 15
    `);
    for (const r of otherCat.rows) {
      console.log(`  ${r.category}: ${Number(r.n).toLocaleString()}건`);
    }

    // 7. 국가계약 vs 지방계약 분포 (예가범위율 -2 vs -3 기준)
    console.log("\n" + "=".repeat(70));
    console.log("7. 국가계약(±2%) vs 지방계약(±3%) 분포 (활성 + 복수예가)");
    console.log("=".repeat(70));
    const ctrType = await pool.query(`
      SELECT
        CASE
          WHEN "rsrvtnPrceRngBgnRate" = -2 AND "rsrvtnPrceRngEndRate" = 2 THEN '국가계약 ±2%'
          WHEN "rsrvtnPrceRngBgnRate" = -3 AND "rsrvtnPrceRngEndRate" = 3 THEN '지방계약 ±3%'
          ELSE 'rsrvtnPrceRngBgn/End 값 다름 (' || "rsrvtnPrceRngBgnRate"::text || ' ~ ' || "rsrvtnPrceRngEndRate"::text || ')'
        END AS contract_type,
        COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE deadline > NOW()
        AND "rawJson"->>'prearngPrceDcsnMthdNm' = '복수예가'
      GROUP BY contract_type
      ORDER BY n DESC LIMIT 10
    `);
    for (const r of ctrType.rows) {
      console.log(`  ${r.contract_type}: ${Number(r.n).toLocaleString()}건`);
    }

    // 8. 부천고용센터 (R26BK01513000) rgstDt 확인
    console.log("\n" + "=".repeat(70));
    console.log("8. 부천고용센터 R26BK01513000 — rgstDt 검증");
    console.log("=".repeat(70));
    const buchon = await pool.query(`
      SELECT "konepsId", title, deadline,
             "rawJson"->>'rgstDt' AS rgst_dt,
             "rawJson"->>'bidNtceDt' AS ntce_dt,
             "sucsfbidLwltRate",
             "rawJson"->>'sucsfbidLwltRate' AS raw_lwlt
      FROM "Announcement"
      WHERE "konepsId" = 'R26BK01513000'
    `);
    for (const r of buchon.rows) {
      console.log(`  ${r.konepsId} | ${r.title}`);
      console.log(`    deadline=${r.deadline} | rgstDt=${r.rgst_dt} | bidNtceDt=${r.ntce_dt}`);
      console.log(`    DB lwlt=${r.sucsfbidLwltRate}% | rawJson.lwlt=${r.raw_lwlt}`);
      const rgst = new Date(r.rgst_dt);
      const cutoff = new Date("2026-01-30");
      console.log(`    rgstDt ${rgst < cutoff ? "<" : "≥"} 2026.1.30 → ${rgst < cutoff ? "옛 비율 정상" : "정정 필요"}`);
    }
  } finally {
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
