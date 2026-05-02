/**
 * G-2: Announcement 인덱스 최적화
 *
 * 진단 결과 (diag-ann-perf.ts):
 *   - 중복: idx_ann_subcategories_gin (90MB) + idx_announcement_subcategories (90MB) → 동일
 *   - region+active+sort 시나리오 104ms → 복합 인덱스로 ~5ms 가능
 *
 * 실행:
 *   1. DROP idx_announcement_subcategories (구식 명명, 12회 scan)
 *   2. CREATE idx_ann_region_deadline (region, deadline DESC) — D 시나리오
 *   3. VACUUM ANALYZE Announcement (8% dead tuple 정리)
 *   4. 사후 EXPLAIN 재측정
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

const STEPS: { name: string; sql: string; skipOnError?: boolean }[] = [
  {
    name: "DROP idx_announcement_subcategories (중복)",
    sql: `DROP INDEX CONCURRENTLY IF EXISTS "idx_announcement_subcategories"`,
    skipOnError: true,
  },
  {
    name: "CREATE idx_ann_region_deadline (region, deadline DESC)",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_ann_region_deadline" ON "Announcement" (region, deadline DESC)`,
  },
];

async function main() {
  const url = loadDatabaseUrl();
  if (!url) { console.error("DATABASE_URL 없음"); process.exit(1); }
  const pool = new Pool({ connectionString: url, max: 1 });

  console.log("=".repeat(76));
  console.log("G-2 Announcement 인덱스 최적화");
  console.log("=".repeat(76));

  for (const { name, sql, skipOnError } of STEPS) {
    const c = await pool.connect();
    try {
      const t0 = Date.now();
      console.log(`\n실행: ${name}`);
      await c.query(sql);
      console.log(`  OK (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
    } catch (e) {
      const msg = (e as Error).message;
      if (skipOnError) {
        console.log(`  스킵: ${msg}`);
      } else {
        console.error(`  실패: ${msg}`);
      }
    } finally { c.release(); }
  }

  // VACUUM ANALYZE는 별도 connection (CONCURRENTLY 후)
  const c = await pool.connect();
  try {
    console.log(`\nVACUUM ANALYZE Announcement...`);
    const t0 = Date.now();
    await c.query(`VACUUM (ANALYZE) "Announcement"`);
    console.log(`  OK (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
  } catch (e) {
    console.error(`  실패: ${(e as Error).message}`);
  } finally { c.release(); }

  // 사후 EXPLAIN — D 시나리오 (region + active)
  const c2 = await pool.connect();
  try {
    console.log("\n" + "=".repeat(76));
    console.log("사후 측정 — D 시나리오 (region=서울 + 활성 + deadline ASC)");
    console.log("=".repeat(76));
    const { rows } = await c2.query(`
      EXPLAIN (ANALYZE, BUFFERS, TIMING)
      SELECT id, "konepsId", title FROM "Announcement"
      WHERE region = '서울' AND deadline >= NOW()
      ORDER BY deadline ASC LIMIT 20
    `);
    for (const r of rows) console.log(`  ${(r as { "QUERY PLAN": string })["QUERY PLAN"]}`);
  } finally { c2.release(); }

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
