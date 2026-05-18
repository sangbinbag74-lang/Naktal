/**
 * F1': 87.745% lwlt 정정 — 시설공사 계열 + 등록 ≥ 2026.1.30 + 예산 구간별 정도값
 *
 * 외부 자료 (2026년 시행령 개정):
 *   < 10억:    89.745%
 *   10억~50억: 88.745%
 *   50억~100억: 87.495%
 *   100억~300억: 81.995%
 *
 * 대상 카테고리: 시설공사 계열 16종
 *   시설공사, 건축공사, 토목공사, 조경공사, 상하수도설비공사, 소방시설공사,
 *   통신공사, 전기공사, 기계설비공사, 도장습식방수석공사, 실내건축공사,
 *   조경식재공사, 지반조성포장공사, 철근콘크리트공사, 구조물해체비계공사, 문화재수리공사
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

const FACILITY_CATEGORIES = [
  "시설공사", "건축공사", "토목공사", "조경공사", "상하수도설비공사",
  "소방시설공사", "통신공사", "전기공사", "기계설비공사", "도장습식방수석공사",
  "실내건축공사", "조경식재공사", "지반조성포장공사", "철근콘크리트공사",
  "구조물해체비계공사", "문화재수리공사",
];

(async () => {
  const pool = new Pool({ connectionString: loadEnv("DIRECT_URL"), max: 1 });
  try {
    // 정정 대상 사전 확인
    const targets = await pool.query(`
      SELECT
        CASE
          WHEN budget < 1000000000  THEN '< 10억 → 89.745%'
          WHEN budget < 5000000000  THEN '10억~50억 → 88.745%'
          WHEN budget < 10000000000 THEN '50억~100억 → 87.495%'
          WHEN budget < 30000000000 THEN '100억~300억 → 81.995%'
          ELSE '300억 이상 (제외)'
        END AS bud_range,
        COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE ABS("sucsfbidLwltRate" - 87.745) < 0.001
        AND "rawJson"->>'prearngPrceDcsnMthdNm' = '복수예가'
        AND category = ANY($1)
        AND ("rawJson"->>'rgstDt')::timestamp >= '2026-01-30'
      GROUP BY bud_range
      ORDER BY n DESC
    `, [FACILITY_CATEGORIES]);
    console.log("=== F1' 정정 대상 사전 확인 ===");
    let total = 0;
    for (const r of targets.rows) {
      const n = Number(r.n);
      total += n;
      console.log(`  ${r.bud_range}: ${n.toLocaleString()}건`);
    }
    console.log(`  [합계]: ${total.toLocaleString()}건\n`);

    // UPDATE 실행 (구간별)
    const ranges: Array<{ name: string; budget_lo: number; budget_hi: number | null; new_lwlt: number }> = [
      { name: "< 10억",      budget_lo: 0,           budget_hi: 1000000000,  new_lwlt: 89.745 },
      { name: "10억~50억",   budget_lo: 1000000000,  budget_hi: 5000000000,  new_lwlt: 88.745 },
      { name: "50억~100억",  budget_lo: 5000000000,  budget_hi: 10000000000, new_lwlt: 87.495 },
      { name: "100억~300억", budget_lo: 10000000000, budget_hi: 30000000000, new_lwlt: 81.995 },
    ];
    let totalUpdated = 0;
    for (const r of ranges) {
      const t0 = Date.now();
      const result = await pool.query(`
        UPDATE "Announcement"
        SET "sucsfbidLwltRate" = $1
        WHERE ABS("sucsfbidLwltRate" - 87.745) < 0.001
          AND "rawJson"->>'prearngPrceDcsnMthdNm' = '복수예가'
          AND category = ANY($2)
          AND ("rawJson"->>'rgstDt')::timestamp >= '2026-01-30'
          AND budget >= $3 AND budget < $4
      `, [r.new_lwlt, FACILITY_CATEGORIES, r.budget_lo, r.budget_hi]);
      console.log(`  ${r.name} → ${r.new_lwlt}%: ${result.rowCount}건 UPDATE (${Date.now()-t0}ms)`);
      totalUpdated += result.rowCount ?? 0;
    }
    console.log(`\n[총 UPDATE 건수]: ${totalUpdated.toLocaleString()}건`);

    // 검증
    const verify = await pool.query(`
      SELECT COUNT(*)::bigint AS remaining
      FROM "Announcement"
      WHERE ABS("sucsfbidLwltRate" - 87.745) < 0.001
        AND "rawJson"->>'prearngPrceDcsnMthdNm' = '복수예가'
        AND category = ANY($1)
        AND ("rawJson"->>'rgstDt')::timestamp >= '2026-01-30'
        AND budget < 30000000000
    `, [FACILITY_CATEGORIES]);
    console.log(`\n[잔여 87.745% (시설공사+등록>=2026.1.30+<300억)]: ${Number(verify.rows[0].remaining).toLocaleString()}건`);
  } finally {
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
