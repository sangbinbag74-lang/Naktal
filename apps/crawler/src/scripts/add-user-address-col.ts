/**
 * User 테이블에 address 컬럼 추가
 * - schema.prisma 에는 정의됐으나 production DB 에는 미반영
 * - 마이그레이션 워크플로 부재 → 직접 ALTER TABLE
 *
 * 실행: pnpm ts-node src/scripts/add-user-address-col.ts
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

function loadEnv(key: "DIRECT_URL"): string {
  const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
  for (const l of env.split("\n")) {
    if (l.startsWith(`${key}=`)) {
      return l.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
    }
  }
  throw new Error(`${key} 없음`);
}

(async () => {
  const pool = new Pool({ connectionString: loadEnv("DIRECT_URL"), max: 1 });
  try {
    const t0 = Date.now();
    await pool.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "address" text`);
    console.log(`  address text: OK (${Date.now() - t0}ms)`);

    const r = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'User' AND column_name = 'address'
    `);
    console.log("\n=== 검증 ===");
    for (const c of r.rows) console.log(`  ${c.column_name}: ${c.data_type} (nullable=${c.is_nullable})`);
  } finally {
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
