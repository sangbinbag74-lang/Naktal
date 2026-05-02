/**
 * 핵심 발견: route.ts L146-159 의 (category IN OR subCategories @>) 패턴
 * EXPLAIN 도중 2분+ stall — production critical
 *
 * 현재 문제 쿼리:
 *   (category IN ('공사','용역') OR "subCategories" @> ARRAY['전기공사'])
 *   AND deadline >= NOW()
 *   ORDER BY "createdAt" DESC LIMIT 20
 *
 * 후보 해법:
 *   A. UNION ALL (category 결과 + subCategories 결과)
 *   B. (category, deadline) 와 subcategories_gin 의 BitmapOr
 *   C. PostgreSQL hint: SET enable_seqscan = OFF
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
    await c.query(`SET statement_timeout = '15s'`);

    const tests = [
      {
        name: "[A] OR 단순 (느린 원본)",
        sql: `EXPLAIN (ANALYZE, BUFFERS, TIMING)
              SELECT id, "konepsId", title FROM "Announcement"
              WHERE (category IN ('공사','용역') OR "subCategories" @> ARRAY['전기공사']::text[])
                AND deadline >= NOW()
              ORDER BY "createdAt" DESC LIMIT 20`,
      },
      {
        name: "[B] category 단독",
        sql: `EXPLAIN (ANALYZE, BUFFERS, TIMING)
              SELECT id, "konepsId", title FROM "Announcement"
              WHERE category IN ('공사','용역') AND deadline >= NOW()
              ORDER BY "createdAt" DESC LIMIT 20`,
      },
      {
        name: "[C] subCategories 단독",
        sql: `EXPLAIN (ANALYZE, BUFFERS, TIMING)
              SELECT id, "konepsId", title FROM "Announcement"
              WHERE "subCategories" @> ARRAY['전기공사']::text[] AND deadline >= NOW()
              ORDER BY "createdAt" DESC LIMIT 20`,
      },
      {
        name: "[D] UNION ALL (category UNION subCategories)",
        sql: `EXPLAIN (ANALYZE, BUFFERS, TIMING)
              (SELECT id, "konepsId", title, "createdAt" FROM "Announcement"
                WHERE category IN ('공사','용역') AND deadline >= NOW()
                ORDER BY "createdAt" DESC LIMIT 20)
              UNION ALL
              (SELECT id, "konepsId", title, "createdAt" FROM "Announcement"
                WHERE "subCategories" @> ARRAY['전기공사']::text[]
                  AND category NOT IN ('공사','용역')
                  AND deadline >= NOW()
                ORDER BY "createdAt" DESC LIMIT 20)
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
        console.log(`  실패/타임아웃: ${(e as Error).message}`);
      }
    }
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
