/**
 * 발견: ORDER BY createdAt DESC LIMIT 20 + 선택성 낮은 필터 → planner가
 * idx_ann_createdat backward 스캔하며 LIMIT 20 만족 기대 → 전체 스캔 폭주
 *
 * 가설 검증:
 *   1. category 단일값 (sample size 작음) → 정상 (1.5ms)
 *   2. category IN (다중값, sample 큼)   → 트랩 가능
 *   3. category IN + deadline 인덱스 hint → 회피 가능
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
    await c.query(`SET statement_timeout = '20s'`);

    // 카테고리별 활성 row count
    console.log("─".repeat(76));
    console.log("카테고리별 활성 (deadline >= NOW()) row count");
    console.log("─".repeat(76));
    const { rows: counts } = await c.query<{ category: string; cnt: string }>(`
      SELECT category, COUNT(*)::text AS cnt FROM "Announcement"
      WHERE deadline >= NOW() AND category IS NOT NULL AND category != ''
      GROUP BY category ORDER BY COUNT(*) DESC LIMIT 10
    `);
    for (const r of counts) console.log(`  ${r.category}: ${r.cnt}`);

    const tests = [
      {
        name: "[1] category='공사' 단일 (원래 1.5ms 성공)",
        sql: `EXPLAIN (ANALYZE, BUFFERS)
              SELECT id, title FROM "Announcement"
              WHERE category = '공사' AND deadline >= NOW()
              ORDER BY "createdAt" DESC LIMIT 20`,
      },
      {
        name: "[2] category IN ('공사','용역')",
        sql: `EXPLAIN (ANALYZE, BUFFERS)
              SELECT id, title FROM "Announcement"
              WHERE category IN ('공사','용역') AND deadline >= NOW()
              ORDER BY "createdAt" DESC LIMIT 20`,
      },
      {
        name: "[3] category IN — Sort by deadline (createdAt 회피)",
        sql: `EXPLAIN (ANALYZE, BUFFERS)
              SELECT id, title FROM "Announcement"
              WHERE category IN ('공사','용역') AND deadline >= NOW()
              ORDER BY deadline ASC LIMIT 20`,
      },
      {
        name: "[4] category IN — CTE 강제 materialize",
        sql: `EXPLAIN (ANALYZE, BUFFERS)
              WITH active AS MATERIALIZED (
                SELECT id, title, "createdAt", category
                FROM "Announcement"
                WHERE category IN ('공사','용역') AND deadline >= NOW()
              )
              SELECT id, title FROM active
              ORDER BY "createdAt" DESC LIMIT 20`,
      },
    ];

    for (const t of tests) {
      console.log(`\n▶ ${t.name}`);
      try {
        const t0 = Date.now();
        const { rows } = await c.query<{ "QUERY PLAN": string }>(t.sql);
        const elapsed = Date.now() - t0;
        for (const r of rows) console.log(`  ${r["QUERY PLAN"]}`);
        console.log(`  >> ${elapsed}ms`);
      } catch (e) {
        console.log(`  실패/타임아웃 20s: ${(e as Error).message}`);
      }
    }
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
