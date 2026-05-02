/**
 * G-2: search_announcements RPC + 인덱스 적용
 *
 * 1. 현재 인덱스/함수 시그니처 진단
 * 2. 미적용 인덱스 CREATE CONCURRENTLY (DIRECT_URL 사용, PgBouncer 회피)
 * 3. 함수 재정의 (CREATE OR REPLACE)
 * 4. 신규 시그니처로 EXPLAIN ANALYZE 5종 실측 (목표: 500ms)
 *
 * 실행: pnpm ts-node src/scripts/g2-apply-search-rpc.ts
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadEnv(key: "DATABASE_URL" | "DIRECT_URL"): string | undefined {
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
      if (k === key && v && !v.includes("[YOUR-PASSWORD]")) return v;
    }
  } catch {}
  return process.env[key];
}

const SQL_FILE = path.resolve(__dirname, "../../../../packages/db/prisma/sql/g2_search_announcements.sql");

async function diagnose(c: import("pg").PoolClient): Promise<void> {
  console.log("\n=== 1. Announcement 인덱스 ===");
  const idx = await c.query<{ indexname: string; indexdef: string }>(`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename = 'Announcement' ORDER BY indexname
  `);
  for (const r of idx.rows) console.log(`  ${r.indexname}`);

  console.log("\n=== 2. search_announcements 함수 시그니처 (전체) ===");
  try {
    const f = await c.query<{ oid: number; args: string }>(`
      SELECT p.oid, pg_get_function_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = 'search_announcements' AND n.nspname = 'public'
    `);
    if (f.rows.length === 0) console.log("  미정의");
    for (const r of f.rows) console.log(`  oid=${r.oid}: ${r.args}`);
  } catch (e) {
    console.log(`  실패: ${(e as Error).message}`);
  }

  console.log("\n=== 3. Announcement 컬럼 실제 타입 ===");
  const cols = await c.query<{ column_name: string; data_type: string; udt_name: string }>(`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_name = 'Announcement'
      AND column_name IN ('id','konepsId','title','orgName','budget','deadline','category','subCategories','region','createdAt','aValueYn')
    ORDER BY ordinal_position
  `);
  for (const r of cols.rows) console.log(`  ${r.column_name}: ${r.data_type} (${r.udt_name})`);

  console.log("\n=== 4. Announcement 테이블 통계 ===");
  const stat = await c.query<{ row_estimate: number; size_mb: number }>(`
    SELECT reltuples::bigint AS row_estimate,
           pg_total_relation_size('"Announcement"') / 1024 / 1024 AS size_mb
    FROM pg_class WHERE relname = 'Announcement'
  `);
  for (const r of stat.rows) console.log(`  추정 행수: ${r.row_estimate?.toLocaleString()}, 총크기: ${r.size_mb}MB`);
}

async function applyIndexesAndRpc(directUrl: string): Promise<void> {
  console.log("\n=== 5. SQL 적용 (DIRECT_URL) ===");

  // 인덱스/ANALYZE는 인라인 (모두 IF NOT EXISTS이라 idempotent)
  const indexStmts: { name: string; sql: string }[] = [
    { name: "GIN subCategories", sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ann_subcat_gin ON "Announcement" USING GIN ("subCategories")` },
    { name: "category+deadline", sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ann_category_deadline ON "Announcement" (category, deadline)` },
    { name: "region+deadline",   sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ann_region_deadline ON "Announcement" (region, deadline)` },
    { name: "ANALYZE",           sql: `ANALYZE "Announcement"` },
  ];

  // 함수는 SQL 파일에서 추출 (CREATE OR REPLACE FUNCTION ~ $$;)
  const sql = fs.readFileSync(SQL_FILE, "utf-8");
  const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION search_announcements[\s\S]+?\$\$;/);
  if (!fnMatch) throw new Error("함수 정의 추출 실패");
  const grantStmt = `GRANT EXECUTE ON FUNCTION search_announcements(text[],text[],text[],text,bigint,bigint,boolean,timestamp,text,int,int) TO anon, authenticated, service_role`;

  const pool = new Pool({ connectionString: directUrl, max: 1 });
  try {
    // 0) 옛 시그니처 DROP — 이름 충돌 + 잘못된 RETURNS TABLE 제거
    console.log("\n  > 옛 함수 모두 DROP...");
    try {
      const oldFns = await pool.query<{ sig: string }>(`
        SELECT format('DROP FUNCTION IF EXISTS public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) AS sig
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'search_announcements' AND n.nspname = 'public'
      `);
      for (const r of oldFns.rows) {
        await pool.query(r.sig);
        console.log(`    ${r.sig.slice(0, 200)}: OK`);
      }
    } catch (e) {
      console.log(`    DROP 실패: ${(e as Error).message.slice(0, 200)}`);
    }

    for (const { name, sql } of indexStmts) {
      const t0 = Date.now();
      try {
        await pool.query(sql);
        console.log(`  ${name}: OK (${Date.now() - t0}ms)`);
      } catch (e) {
        console.log(`  ${name}: 실패 - ${(e as Error).message.slice(0, 200)}`);
      }
    }

    console.log("\n  > 함수 재정의...");
    const t0 = Date.now();
    try {
      await pool.query(fnMatch[0]);
      console.log(`    함수: OK (${Date.now() - t0}ms)`);
    } catch (e) {
      console.log(`    함수: 실패 - ${(e as Error).message.slice(0, 500)}`);
      throw e;
    }

    try {
      await pool.query(grantStmt);
      console.log("    GRANT: OK");
    } catch (e) {
      console.log(`    GRANT: 실패 - ${(e as Error).message.slice(0, 200)}`);
    }
  } finally {
    await pool.end();
  }
}

async function benchmark(c: import("pg").PoolClient): Promise<void> {
  const tests = [
    {
      name: "RPC: 카테고리=공사 + 활성 (latest)",
      sql: `EXPLAIN (ANALYZE, BUFFERS)
            SELECT * FROM search_announcements(
              p_categories  => ARRAY['공사']::text[],
              p_subcats     => NULL,
              p_regions     => NULL,
              p_keyword     => NULL,
              p_min_budget  => NULL,
              p_max_budget  => NULL,
              p_active_only => TRUE,
              p_deadline_to => NULL,
              p_sort        => 'latest',
              p_limit       => 20,
              p_offset      => 0
            )`,
    },
    {
      name: "RPC: subcats=조경식재 (GIN 검증)",
      sql: `EXPLAIN (ANALYZE, BUFFERS)
            SELECT * FROM search_announcements(
              p_categories  => NULL,
              p_subcats     => ARRAY['조경식재']::text[],
              p_active_only => TRUE,
              p_sort        => 'latest',
              p_limit       => 20
            )`,
    },
    {
      name: "RPC: 키워드=아파트 + 활성",
      sql: `EXPLAIN (ANALYZE, BUFFERS)
            SELECT * FROM search_announcements(
              p_keyword     => '아파트',
              p_active_only => TRUE,
              p_sort        => 'latest',
              p_limit       => 20
            )`,
    },
    {
      name: "RPC: region=서울 + 활성 (deadline 정렬)",
      sql: `EXPLAIN (ANALYZE, BUFFERS)
            SELECT * FROM search_announcements(
              p_regions     => ARRAY['서울']::text[],
              p_active_only => TRUE,
              p_sort        => 'deadline',
              p_limit       => 20
            )`,
    },
    {
      name: "RPC: 복합(공사+서울+활성)",
      sql: `EXPLAIN (ANALYZE, BUFFERS)
            SELECT * FROM search_announcements(
              p_categories  => ARRAY['공사']::text[],
              p_regions     => ARRAY['서울']::text[],
              p_active_only => TRUE,
              p_sort        => 'latest',
              p_limit       => 20
            )`,
    },
  ];

  console.log("\n=== 5. 신규 RPC EXPLAIN ANALYZE ===");
  for (const t of tests) {
    console.log(`\n▶ ${t.name}`);
    const t0 = Date.now();
    try {
      const { rows } = await c.query<{ "QUERY PLAN": string }>(t.sql);
      const elapsed = Date.now() - t0;
      for (const r of rows) console.log(`  ${r["QUERY PLAN"]}`);
      console.log(`  → ${elapsed}ms${elapsed < 500 ? " ✅" : " ⚠️"}`);
    } catch (e) {
      console.log(`  실패: ${(e as Error).message}`);
    }
  }
}

async function main() {
  const directUrl = loadEnv("DIRECT_URL");
  const databaseUrl = loadEnv("DATABASE_URL");
  if (!directUrl) { console.error("DIRECT_URL 없음"); process.exit(1); }
  if (!databaseUrl) { console.error("DATABASE_URL 없음"); process.exit(1); }

  // 1. 진단 (DATABASE_URL — pooler 가능)
  const dPool = new Pool({ connectionString: databaseUrl, max: 1 });
  const dC = await dPool.connect();
  try {
    await diagnose(dC);
  } finally {
    dC.release();
    await dPool.end();
  }

  // 2. 적용 (DIRECT_URL — CONCURRENTLY 위해 PgBouncer 회피)
  await applyIndexesAndRpc(directUrl);

  // 3. 벤치마크 (DIRECT_URL)
  const bPool = new Pool({ connectionString: directUrl, max: 1 });
  const bC = await bPool.connect();
  try {
    await benchmark(bC);
  } finally {
    bC.release();
    await bPool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
