/**
 * search_announcements RPC 실측 — 재활성화 가치 평가
 *
 * 현재 정의 (pg_get_functiondef 결과):
 *   - region ILIKE '%X%'  → 인덱스 미사용 (full scan)
 *   - title ILIKE '%X%'   → 인덱스 미사용
 *   - COUNT(*) OVER()     → 윈도우 함수, 6.6M 전수
 *   - sort: deadline ASC 강제
 *
 * 시나리오: 카테고리만 + 활성 (가장 가벼운 조건)
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
    const tests = [
      {
        name: "RPC: 카테고리=공사 + 활성",
        sql: `EXPLAIN (ANALYZE, BUFFERS, TIMING)
              SELECT * FROM search_announcements(
                p_categories => ARRAY['공사']::text[],
                p_region => NULL,
                p_keyword => NULL,
                p_deadline_from => NOW(),
                p_deadline_to => NULL,
                p_limit => 20,
                p_offset => 0
              )`,
      },
      {
        name: "RPC: 키워드=아파트 + 활성",
        sql: `EXPLAIN (ANALYZE, BUFFERS, TIMING)
              SELECT * FROM search_announcements(
                p_categories => NULL,
                p_region => NULL,
                p_keyword => '아파트',
                p_deadline_from => NOW(),
                p_deadline_to => NULL,
                p_limit => 20,
                p_offset => 0
              )`,
      },
      {
        name: "RPC: region=서울 + 활성",
        sql: `EXPLAIN (ANALYZE, BUFFERS, TIMING)
              SELECT * FROM search_announcements(
                p_categories => NULL,
                p_region => '서울',
                p_keyword => NULL,
                p_deadline_from => NOW(),
                p_deadline_to => NULL,
                p_limit => 20,
                p_offset => 0
              )`,
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
        console.log(`  실패: ${(e as Error).message}`);
      }
    }
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
