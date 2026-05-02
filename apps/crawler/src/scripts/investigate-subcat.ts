/**
 * subCategories 감소 원인 분석
 * 6,658,785 중 4,171,605(62.65%) → 6,658,898 중 4,141,787(62.20%)
 * 30,000건 사라진 원인 추적
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
  const pool = new Pool({ connectionString: loadDatabaseUrl()!, max: 1 });
  const c = await pool.connect();
  try {
    console.log(`=== subCategories 감소 원인 분석 ===\n`);

    // 1. NULL vs empty vs non-empty 분포
    const r1 = await c.query(`
      SELECT
        COUNT(*)::bigint AS total,
        SUM(CASE WHEN "subCategories" IS NULL THEN 1 ELSE 0 END)::bigint AS is_null,
        SUM(CASE WHEN "subCategories" = '{}' THEN 1 ELSE 0 END)::bigint AS empty_arr,
        SUM(CASE WHEN array_length("subCategories", 1) IS NULL AND "subCategories" IS NOT NULL THEN 1 ELSE 0 END)::bigint AS zero_len,
        SUM(CASE WHEN array_length("subCategories", 1) > 0 THEN 1 ELSE 0 END)::bigint AS has_items
      FROM "Announcement"
    `);
    const x = r1.rows[0];
    const t = Number(x.total);
    console.log(`[1] subCategories 상태 분포:`);
    console.log(`  전체         : ${t.toLocaleString()}`);
    console.log(`  NULL         : ${Number(x.is_null).toLocaleString()} (${((Number(x.is_null)/t)*100).toFixed(2)}%)`);
    console.log(`  '{}' (빈배열): ${Number(x.empty_arr).toLocaleString()} (${((Number(x.empty_arr)/t)*100).toFixed(2)}%)`);
    console.log(`  len=NULL + not null: ${Number(x.zero_len).toLocaleString()}`);
    console.log(`  len>0 (정상) : ${Number(x.has_items).toLocaleString()} (${((Number(x.has_items)/t)*100).toFixed(2)}%)`);

    // 2. 재실행된 월 범위에서 NULL 비율 확인 (2015-11, 2016-01, 2016-02 등)
    const reRunMonths = [
      '2015-11', '2016-01', '2016-02', '2016-11', '2017-01', '2017-02', '2017-11',
      '2019-11', '2020-01', '2020-02', '2020-03', '2020-04', '2020-05',
    ];

    console.log(`\n[2] 재실행 대상 월별 NULL/빈배열 비율:`);
    for (const ym of reRunMonths) {
      const r = await c.query(`
        SELECT
          COUNT(*)::bigint AS total,
          SUM(CASE WHEN "subCategories" IS NULL THEN 1 ELSE 0 END)::bigint AS null_cnt,
          SUM(CASE WHEN array_length("subCategories", 1) IS NULL THEN 1 ELSE 0 END)::bigint AS empty_cnt,
          SUM(CASE WHEN array_length("subCategories", 1) > 0 THEN 1 ELSE 0 END)::bigint AS filled
        FROM "Announcement"
        WHERE deadline >= $1::timestamptz AND deadline < $2::timestamptz
      `, [`${ym}-01`, `${ym.slice(0,4)}-${String(parseInt(ym.slice(5,7))+1).padStart(2,'0')}-01`]);
      const row = r.rows[0];
      const tt = Number(row.total);
      const nn = Number(row.null_cnt);
      const ee = Number(row.empty_cnt);
      const ff = Number(row.filled);
      console.log(`  ${ym}: 전체 ${tt.toString().padStart(6)} | NULL ${nn.toString().padStart(5)} | 빈 ${ee.toString().padStart(5)} | 채움 ${ff.toString().padStart(5)}`);
    }

    // 3. UNNEST with NULL behavior 확인
    console.log(`\n[3] PostgreSQL 배열 연산 테스트:`);
    const tests = [
      `SELECT ARRAY_AGG(DISTINCT x) AS r FROM UNNEST(NULL::text[] || ARRAY['a','b']) AS x`,
      `SELECT ARRAY_AGG(DISTINCT x) AS r FROM UNNEST(ARRAY[]::text[] || ARRAY['a','b']) AS x`,
      `SELECT ARRAY_AGG(DISTINCT x) AS r FROM UNNEST(ARRAY['a']::text[] || ARRAY['a','b']) AS x`,
    ];
    for (const sql of tests) {
      const r = await c.query(sql);
      console.log(`  ${sql.replace(/\s+/g,' ').slice(0,80)}`);
      console.log(`    → ${JSON.stringify(r.rows[0].r)}`);
    }

    // 4. array_length 함수의 빈 배열 반환값
    const r4 = await c.query(`
      SELECT
        array_length(ARRAY[]::text[], 1) AS empty,
        array_length(NULL::text[], 1) AS null_arr,
        array_length(ARRAY['a']::text[], 1) AS one
    `);
    console.log(`\n[4] array_length:`);
    console.log(`  ARRAY[]      → ${JSON.stringify(r4.rows[0].empty)}`);
    console.log(`  NULL         → ${JSON.stringify(r4.rows[0].null_arr)}`);
    console.log(`  ARRAY['a']   → ${JSON.stringify(r4.rows[0].one)}`);

    // 5. 체크 쿼리 array_length > 0 필터는 NULL도 배제함을 확인
    console.log(`\n[5] 결론:`);
    console.log(`  check-progress-full의 array_length("subCategories", 1) > 0 조건은`);
    console.log(`  NULL과 '{}'(빈 배열) 모두 제외함. 따라서:`);
    console.log(`    filled = len > 0 인 것만 카운트.`);
    console.log(`  만약 재실행 UPDATE가 NULL을 만들었다면 filled 수 감소 = 관찰된 30K 감소`);
  } finally {
    c.release();
    await pool.end();
  }
}
main().catch(console.error);
