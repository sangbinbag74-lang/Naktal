/**
 * Announcement 테이블 인덱스 추가
 * 600만+ 행에서 기본 쿼리가 timeout → 필수 인덱스 생성.
 * CONCURRENTLY로 락 걸지 않고 생성.
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

const INDEXES: { name: string; sql: string }[] = [
  {
    name: "idx_ann_createdat",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_ann_createdat" ON "Announcement" ("createdAt" DESC)`,
  },
  {
    name: "idx_ann_deadline",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_ann_deadline" ON "Announcement" (deadline DESC)`,
  },
  {
    name: "idx_ann_category",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_ann_category" ON "Announcement" (category)`,
  },
  {
    name: "idx_ann_region",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_ann_region" ON "Announcement" (region)`,
  },
  {
    name: "idx_ann_deadline_category",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_ann_deadline_category" ON "Announcement" (deadline DESC, category)`,
  },
  {
    name: "idx_ann_orgname",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_ann_orgname" ON "Announcement" ("orgName")`,
  },
];

async function main() {
  const url = loadDatabaseUrl();
  if (!url) { console.error("DATABASE_URL 없음"); process.exit(1); }

  const pool = new Pool({ connectionString: url, max: 1 });

  // 기존 인덱스 먼저 조회
  const client = await pool.connect();
  try {
    const existing = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'Announcement'
      ORDER BY indexname
    `);
    console.log("=== 현재 Announcement 인덱스 ===");
    for (const r of existing.rows) console.log(`  - ${r.indexname}`);
    console.log("");
  } finally {
    client.release();
  }

  // 각 인덱스 생성 (CONCURRENTLY는 autocommit이라 트랜잭션 밖에서)
  for (const { name, sql } of INDEXES) {
    const c = await pool.connect();
    try {
      const t0 = Date.now();
      console.log(`생성 중: ${name}`);
      await c.query(sql);
      const ms = Date.now() - t0;
      console.log(`  ✓ 완료 (${(ms / 1000).toFixed(1)}초)`);
    } catch (e) {
      console.error(`  ✗ 실패: ${(e as Error).message}`);
    } finally {
      c.release();
    }
  }

  // ANALYZE로 통계 갱신 (쿼리 플래너 최신화)
  const c = await pool.connect();
  try {
    console.log("\nANALYZE \"Announcement\" ...");
    await c.query(`ANALYZE "Announcement"`);
    console.log("  ✓ 완료");
  } finally {
    c.release();
  }

  await pool.end();
  console.log("\n전체 완료");
}

main().catch((e) => { console.error(e); process.exit(1); });
