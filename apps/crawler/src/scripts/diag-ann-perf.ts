/**
 * G-2-a: 공고 목록 RPC 성능 진단
 *
 * 목적:
 *   1. Announcement 테이블 인덱스 전수 조사
 *   2. search_announcements RPC 정의 확인 (있으면)
 *   3. 대표 쿼리 EXPLAIN ANALYZE — 병목 식별
 *   4. 통계 (rowcount, size, bloat 추정)
 *
 * 사용:
 *   pnpm ts-node apps/crawler/src/scripts/diag-ann-perf.ts
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadDatabaseUrl(): string | undefined {
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
      if (k === "DATABASE_URL" && v && !v.includes("[YOUR-PASSWORD]")) return v;
    }
  } catch {}
  return process.env.DATABASE_URL;
}

async function main() {
  const url = loadDatabaseUrl();
  if (!url) { console.error("DATABASE_URL 없음"); process.exit(1); }
  const pool = new Pool({ connectionString: url, max: 1 });
  const c = await pool.connect();

  try {
    console.log("=".repeat(76));
    console.log("1. Announcement 테이블 통계");
    console.log("=".repeat(76));
    const { rows: stats } = await c.query<{
      rowcount: string;
      table_size: string;
      indexes_size: string;
      total_size: string;
    }>(`
      SELECT
        (SELECT reltuples::bigint FROM pg_class WHERE relname='Announcement') AS rowcount,
        pg_size_pretty(pg_table_size('"Announcement"')) AS table_size,
        pg_size_pretty(pg_indexes_size('"Announcement"')) AS indexes_size,
        pg_size_pretty(pg_total_relation_size('"Announcement"')) AS total_size
    `);
    console.log(stats[0]);

    console.log("\n" + "=".repeat(76));
    console.log("2. Announcement 인덱스 목록");
    console.log("=".repeat(76));
    const { rows: idxs } = await c.query<{
      indexname: string;
      indexdef: string;
      idx_size: string;
      idx_scan: string;
      idx_tup_read: string;
      idx_tup_fetch: string;
    }>(`
      SELECT
        i.indexname,
        i.indexdef,
        pg_size_pretty(pg_relation_size(c.oid)) AS idx_size,
        s.idx_scan::text,
        s.idx_tup_read::text,
        s.idx_tup_fetch::text
      FROM pg_indexes i
      JOIN pg_class c ON c.relname = i.indexname
      LEFT JOIN pg_stat_user_indexes s ON s.indexrelname = i.indexname
      WHERE i.tablename = 'Announcement'
      ORDER BY pg_relation_size(c.oid) DESC
    `);
    for (const r of idxs) {
      console.log(`\n  ${r.indexname}  (size=${r.idx_size}, scan=${r.idx_scan}, read=${r.idx_tup_read}, fetch=${r.idx_tup_fetch})`);
      console.log(`    ${r.indexdef}`);
    }

    console.log("\n" + "=".repeat(76));
    console.log("3. search_announcements / search_ann_nospace RPC 정의");
    console.log("=".repeat(76));
    const { rows: fns } = await c.query<{ proname: string; def: string }>(`
      SELECT p.proname, pg_get_functiondef(p.oid) AS def
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('search_announcements','search_ann_nospace')
    `);
    if (fns.length === 0) {
      console.log("  (정의 없음)");
    } else {
      for (const f of fns) {
        console.log(`\n  --- ${f.proname} ---`);
        console.log(f.def);
      }
    }

    console.log("\n" + "=".repeat(76));
    console.log("4. 대표 쿼리 EXPLAIN ANALYZE");
    console.log("=".repeat(76));

    const queries = [
      {
        name: "A. 활성 공고 + createdAt 정렬 (필터 없음)",
        sql: `
          SELECT id, "konepsId", title, "orgName", budget, deadline, category, "subCategories", region, "createdAt"
          FROM "Announcement"
          WHERE deadline >= NOW()
          ORDER BY "createdAt" DESC
          LIMIT 20
        `,
      },
      {
        name: "B. 카테고리 (공사) + 활성 + createdAt 정렬",
        sql: `
          SELECT id, "konepsId", title, "orgName", budget, deadline, category, "subCategories", region, "createdAt"
          FROM "Announcement"
          WHERE category IN ('공사')
            AND deadline >= NOW()
          ORDER BY "createdAt" DESC
          LIMIT 20
        `,
      },
      {
        name: "C. subCategories 배열 검색 (조경식재) + 활성",
        sql: `
          SELECT id, "konepsId", title, "orgName", budget, deadline, category, "subCategories", region, "createdAt"
          FROM "Announcement"
          WHERE "subCategories" @> ARRAY['조경식재']::text[]
            AND deadline >= NOW()
          ORDER BY "createdAt" DESC
          LIMIT 20
        `,
      },
      {
        name: "D. region 필터 + 활성 + deadline 정렬",
        sql: `
          SELECT id, "konepsId", title, "orgName", budget, deadline, category, "subCategories", region, "createdAt"
          FROM "Announcement"
          WHERE region = '서울'
            AND deadline >= NOW()
          ORDER BY deadline ASC
          LIMIT 20
        `,
      },
      {
        name: "E. 키워드 ilike (전체검색)",
        sql: `
          SELECT id, "konepsId", title, "orgName", budget, deadline, category, "subCategories", region, "createdAt"
          FROM "Announcement"
          WHERE (title ILIKE '%아파트%' OR "orgName" ILIKE '%아파트%')
            AND deadline >= NOW()
          ORDER BY "createdAt" DESC
          LIMIT 20
        `,
      },
    ];

    for (const q of queries) {
      console.log(`\n  ▶ ${q.name}`);
      try {
        const t0 = Date.now();
        const { rows: plan } = await c.query<{ "QUERY PLAN": string }>(
          `EXPLAIN (ANALYZE, BUFFERS, TIMING, SUMMARY) ${q.sql}`
        );
        const elapsed = Date.now() - t0;
        for (const r of plan) console.log(`    ${r["QUERY PLAN"]}`);
        console.log(`    (실측 ${elapsed}ms)`);
      } catch (e) {
        console.log(`    ✗ ${(e as Error).message}`);
      }
    }

    console.log("\n" + "=".repeat(76));
    console.log("5. n_dead_tup / n_live_tup (bloat 추정)");
    console.log("=".repeat(76));
    const { rows: deadtup } = await c.query(`
      SELECT n_live_tup, n_dead_tup,
             ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_pct,
             last_vacuum, last_autovacuum, last_analyze, last_autoanalyze
      FROM pg_stat_user_tables WHERE relname = 'Announcement'
    `);
    console.log(deadtup[0]);

  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
