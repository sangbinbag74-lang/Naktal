/**
 * 2차 인덱스 — deadline 필터 + createdAt 정렬 복합 쿼리 최적화
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
    name: "idx_ann_deadline_createdat",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_ann_deadline_createdat" ON "Announcement" (deadline DESC, "createdAt" DESC)`,
  },
  {
    name: "idx_ann_category_deadline",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_ann_category_deadline" ON "Announcement" (category, deadline DESC)`,
  },
];

async function main() {
  const url = loadDatabaseUrl();
  if (!url) { console.error("DATABASE_URL 없음"); process.exit(1); }
  const pool = new Pool({ connectionString: url, max: 1 });
  for (const { name, sql } of INDEXES) {
    const c = await pool.connect();
    try {
      const t0 = Date.now();
      console.log(`생성 중: ${name}`);
      await c.query(sql);
      console.log(`  ✓ ${((Date.now() - t0) / 1000).toFixed(1)}초`);
    } catch (e) {
      console.error(`  ✗ ${(e as Error).message}`);
    } finally { c.release(); }
  }
  const c = await pool.connect();
  try {
    console.log("\nANALYZE...");
    await c.query(`ANALYZE "Announcement"`);
    console.log("  ✓");
  } finally { c.release(); }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
