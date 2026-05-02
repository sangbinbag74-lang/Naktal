/**
 * G-2 사후 검증 v2: route.ts L211-213 ORDER BY trap 폴백 적용 후
 *
 * 핵심 시나리오: 다중 카테고리 + 활성 deadline + ORDER BY deadline ASC LIMIT 20
 *   → idx_ann_category_deadline 또는 idx_ann_deadline_category 사용 → 9~12ms 목표
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

const queries = [
  {
    name: "[FB-1] category IN + 활성 + deadline ASC (폴백 적용 후 V1)",
    sql: `EXPLAIN (ANALYZE, BUFFERS)
          SELECT id, title FROM "Announcement"
          WHERE category IN ('공사','용역') AND deadline >= NOW()
          ORDER BY deadline ASC LIMIT 20`,
  },
  {
    name: "[FB-2] (category IN OR subCategories @>) + 활성 + deadline ASC (폴백 V2)",
    sql: `EXPLAIN (ANALYZE, BUFFERS)
          SELECT id, title FROM "Announcement"
          WHERE (category IN ('공사','용역') OR "subCategories" @> ARRAY['전기공사']::text[])
            AND deadline >= NOW()
          ORDER BY deadline ASC LIMIT 20`,
  },
  {
    name: "[FB-3] region IN + 활성 + deadline ASC (다중 지역 폴백)",
    sql: `EXPLAIN (ANALYZE, BUFFERS)
          SELECT id, title FROM "Announcement"
          WHERE region IN ('서울','경기','인천') AND deadline >= NOW()
          ORDER BY deadline ASC LIMIT 20`,
  },
  {
    name: "[FB-4] region IN + category IN + 활성 + deadline ASC (복합 폴백)",
    sql: `EXPLAIN (ANALYZE, BUFFERS)
          SELECT id, title FROM "Announcement"
          WHERE region IN ('서울','경기') AND category IN ('공사','용역')
            AND deadline >= NOW()
          ORDER BY deadline ASC LIMIT 20`,
  },
  {
    name: "[FB-5] keyword ILIKE + 활성 + deadline ASC (키워드 폴백)",
    sql: `EXPLAIN (ANALYZE, BUFFERS)
          SELECT id, title FROM "Announcement"
          WHERE (title ILIKE '%아파트%' OR "orgName" ILIKE '%아파트%')
            AND deadline >= NOW()
          ORDER BY deadline ASC LIMIT 20`,
  },
  {
    name: "[NF-1] 필터 없음 + 활성 + createdAt DESC (폴백 미적용 — 그대로)",
    sql: `EXPLAIN (ANALYZE, BUFFERS)
          SELECT id, title FROM "Announcement"
          WHERE deadline >= NOW()
          ORDER BY "createdAt" DESC LIMIT 20`,
  },
  {
    name: "[NF-2] 단일 region + 활성 + deadline ASC",
    sql: `EXPLAIN (ANALYZE, BUFFERS)
          SELECT id, title FROM "Announcement"
          WHERE region = '서울' AND deadline >= NOW()
          ORDER BY deadline ASC LIMIT 20`,
  },
];

async function main() {
  const pool = new Pool({ connectionString: loadDatabaseUrl()!, max: 1 });
  const c = await pool.connect();
  try {
    await c.query(`SET statement_timeout = '20s'`);
    console.log("=".repeat(76));
    console.log("G-2 사후 검증 v2 — route.ts 폴백 적용 후 시나리오");
    console.log("=".repeat(76));
    for (const q of queries) {
      console.log(`\n▶ ${q.name}`);
      try {
        const t0 = Date.now();
        const { rows } = await c.query<{ "QUERY PLAN": string }>(q.sql);
        const elapsed = Date.now() - t0;
        for (const r of rows) {
          const line = r["QUERY PLAN"];
          if (
            line.includes("Execution Time:") ||
            line.includes("Index") ||
            line.includes("Bitmap") ||
            /^Limit/.test(line) ||
            /^\s+->\s*\w/.test(line)
          ) {
            console.log(`  ${line}`);
          }
        }
        console.log(`  >> ${elapsed}ms`);
      } catch (e) {
        console.log(`  실패/타임아웃: ${(e as Error).message}`);
      }
    }
  } finally {
    c.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
