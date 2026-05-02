/**
 * G-2 사후 검증: PostgREST 체인 쿼리 패턴이 실제로 새 인덱스를 사용하는지 확인
 *
 * route.ts 의 fetchFromDB 가 만드는 패턴:
 *   - region IN (...) AND deadline >= NOW()
 *   - (category IN (...) OR subCategories @> ...) AND deadline >= NOW()
 *   - title ILIKE '%x%' OR orgName ILIKE '%x%'
 *   - rawJson->>'field' ILIKE '%x%'
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

const queries = [
  {
    name: "1. 활성 + 최신순 (필터 없음)",
    sql: `SELECT id, "konepsId", title FROM "Announcement"
          WHERE deadline >= NOW() ORDER BY "createdAt" DESC LIMIT 20`,
  },
  {
    name: "2. 다중 region IN + 활성 + deadline 정렬",
    sql: `SELECT id, "konepsId", title FROM "Announcement"
          WHERE region IN ('서울','경기','인천') AND deadline >= NOW()
          ORDER BY deadline ASC LIMIT 20`,
  },
  {
    name: "3. category IN + 활성 + 최신순 (PostgREST .or 패턴)",
    sql: `SELECT id, "konepsId", title FROM "Announcement"
          WHERE (category IN ('공사','용역') OR "subCategories" @> ARRAY['전기공사']::text[])
            AND deadline >= NOW()
          ORDER BY "createdAt" DESC LIMIT 20`,
  },
  {
    name: "4. region + category + 활성 (복합 필터)",
    sql: `SELECT id, "konepsId", title FROM "Announcement"
          WHERE region = '서울' AND category = '공사' AND deadline >= NOW()
          ORDER BY "createdAt" DESC LIMIT 20`,
  },
  {
    name: "5. 키워드 ILIKE + 활성",
    sql: `SELECT id, "konepsId", title FROM "Announcement"
          WHERE (title ILIKE '%아파트%' OR "orgName" ILIKE '%아파트%')
            AND deadline >= NOW()
          ORDER BY "createdAt" DESC LIMIT 20`,
  },
  {
    name: "6. budget 범위 + 활성",
    sql: `SELECT id, "konepsId", title FROM "Announcement"
          WHERE budget >= 100000000 AND budget <= 1000000000
            AND deadline >= NOW()
          ORDER BY "createdAt" DESC LIMIT 20`,
  },
  {
    name: "7. rawJson->>field ILIKE (참여제한 검색)",
    sql: `SELECT id, "konepsId", title FROM "Announcement"
          WHERE "rawJson"->>'prtcptnLmtNm' ILIKE '%서울%'
            AND deadline >= NOW()
          ORDER BY "createdAt" DESC LIMIT 20`,
  },
  {
    name: "8. konepsId 부분 매칭",
    sql: `SELECT id, "konepsId", title FROM "Announcement"
          WHERE "konepsId" ILIKE '%2024%' LIMIT 20`,
  },
  {
    name: "9. 페이지 100 (offset=2000)",
    sql: `SELECT id, "konepsId", title FROM "Announcement"
          WHERE deadline >= NOW() ORDER BY "createdAt" DESC LIMIT 20 OFFSET 2000`,
  },
];

async function main() {
  const url = loadDatabaseUrl();
  if (!url) { console.error("DATABASE_URL 없음"); process.exit(1); }
  const pool = new Pool({ connectionString: url, max: 1 });
  const c = await pool.connect();

  try {
    console.log("=".repeat(76));
    console.log("G-2 사후 검증 — 9가지 시나리오");
    console.log("=".repeat(76));

    for (const q of queries) {
      console.log(`\n▶ ${q.name}`);
      try {
        // Warm-up (cache effect 제거 위한 측정)
        await c.query(q.sql);
        const t0 = Date.now();
        const { rows } = await c.query<{ "QUERY PLAN": string }>(
          `EXPLAIN (ANALYZE, BUFFERS) ${q.sql}`
        );
        const elapsed = Date.now() - t0;
        // 첫 줄 + 실행시간 라인만 출력
        for (const r of rows) {
          const line = r["QUERY PLAN"];
          if (line.includes("Execution Time:") || line.includes("Index") || /^\s*->\s*\w/.test(line) || /^Limit/.test(line)) {
            console.log(`  ${line}`);
          }
        }
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
