/**
 * G-2 v3: INVALID 인덱스 정리 + 재생성
 *
 * 이전 시도에서 statement_timeout 으로 CREATE INDEX CONCURRENTLY가
 * INVALID 상태로 남음 (idx_ann_category_createdat, idx_ann_region_createdat)
 *
 * 해결: 명시적으로 statement_timeout=0 + lock_timeout=0 설정 후 재생성
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadDatabaseUrl(): string | undefined {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  try {
    const content = fs.readFileSync(rootEnv, "utf-8");
    let direct: string | undefined;
    let pooled: string | undefined;
    for (const line of content.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eqIdx = t.indexOf("=");
      if (eqIdx === -1) continue;
      const k = t.slice(0, eqIdx).trim();
      const v = t.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (k === "DIRECT_URL" && v && !v.includes("[YOUR-PASSWORD]")) direct = v;
      if (k === "DATABASE_URL" && v && !v.includes("[YOUR-PASSWORD]")) pooled = v;
    }
    return direct ?? pooled;
  } catch {}
  return process.env.DIRECT_URL ?? process.env.DATABASE_URL;
}

const STEPS: { name: string; sql: string }[] = [
  // 1. DROP 잔재
  { name: "DROP idx_ann_category_createdat (INVALID)",
    sql: `DROP INDEX CONCURRENTLY IF EXISTS "idx_ann_category_createdat"` },
  { name: "DROP idx_ann_region_createdat (INVALID)",
    sql: `DROP INDEX CONCURRENTLY IF EXISTS "idx_ann_region_createdat"` },
  // 2. 재생성 (timeout 무효화 후)
  { name: "CREATE idx_ann_category_createdat (category, createdAt DESC)",
    sql: `CREATE INDEX CONCURRENTLY "idx_ann_category_createdat" ON "Announcement" (category, "createdAt" DESC)` },
  { name: "CREATE idx_ann_region_createdat (region, createdAt DESC)",
    sql: `CREATE INDEX CONCURRENTLY "idx_ann_region_createdat" ON "Announcement" (region, "createdAt" DESC)` },
];

async function main() {
  const url = loadDatabaseUrl();
  if (!url) { console.error("DATABASE_URL 없음"); process.exit(1); }
  const pool = new Pool({ connectionString: url, max: 1 });

  console.log("=".repeat(76));
  console.log("G-2 v3 — INVALID 정리 + 재생성");
  console.log("=".repeat(76));

  for (const { name, sql } of STEPS) {
    const c = await pool.connect();
    try {
      // 각 connection마다 timeout 무효화
      await c.query(`SET statement_timeout = 0`);
      await c.query(`SET lock_timeout = 0`);
      await c.query(`SET idle_in_transaction_session_timeout = 0`);
      const t0 = Date.now();
      console.log(`\n실행: ${name}`);
      await c.query(sql);
      console.log(`  OK (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
    } catch (e) {
      console.error(`  실패: ${(e as Error).message}`);
    } finally { c.release(); }
  }

  // ANALYZE
  const c = await pool.connect();
  try {
    await c.query(`SET statement_timeout = 0`);
    console.log(`\nANALYZE Announcement...`);
    const t0 = Date.now();
    await c.query(`ANALYZE "Announcement"`);
    console.log(`  OK (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
  } finally { c.release(); }

  // 사후 검증
  const c2 = await pool.connect();
  try {
    await c2.query(`SET statement_timeout = '20s'`);
    const tests = [
      {
        name: "[V1] category IN + createdAt DESC (이전 20초 타임아웃)",
        sql: `EXPLAIN (ANALYZE, BUFFERS)
              SELECT id, title FROM "Announcement"
              WHERE category IN ('공사','용역') AND deadline >= NOW()
              ORDER BY "createdAt" DESC LIMIT 20`,
      },
      {
        name: "[V2] category IN OR subCategories + createdAt DESC",
        sql: `EXPLAIN (ANALYZE, BUFFERS)
              SELECT id, title FROM "Announcement"
              WHERE (category IN ('공사','용역') OR "subCategories" @> ARRAY['전기공사']::text[])
                AND deadline >= NOW()
              ORDER BY "createdAt" DESC LIMIT 20`,
      },
      {
        name: "[V3] region + createdAt DESC",
        sql: `EXPLAIN (ANALYZE, BUFFERS)
              SELECT id, title FROM "Announcement"
              WHERE region = '서울' AND deadline >= NOW()
              ORDER BY "createdAt" DESC LIMIT 20`,
      },
    ];
    for (const t of tests) {
      console.log(`\n▶ ${t.name}`);
      try {
        const t0 = Date.now();
        const { rows } = await c2.query<{ "QUERY PLAN": string }>(t.sql);
        const elapsed = Date.now() - t0;
        for (const r of rows) console.log(`  ${r["QUERY PLAN"]}`);
        console.log(`  >> ${elapsed}ms`);
      } catch (e) {
        console.log(`  실패/타임아웃: ${(e as Error).message}`);
      }
    }
  } finally { c2.release(); }

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
