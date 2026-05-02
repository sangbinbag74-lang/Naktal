/**
 * G-4: BidOutcome 에 actualBidders + actualOpeningIdx 컬럼 추가
 * - schema.prisma 에는 이미 정의됐으나 production DB에는 미반영
 * - 마이그레이션 워크플로 부재 → 직접 ALTER TABLE
 *
 * 실행: pnpm ts-node src/scripts/g4-add-outcome-cols.ts
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
    const stmts: { name: string; sql: string }[] = [
      {
        name: "actualBidders int",
        sql: `ALTER TABLE "BidOutcome" ADD COLUMN IF NOT EXISTS "actualBidders" integer`,
      },
      {
        name: "actualOpeningIdx int[]",
        sql: `ALTER TABLE "BidOutcome" ADD COLUMN IF NOT EXISTS "actualOpeningIdx" integer[] NOT NULL DEFAULT '{}'`,
      },
    ];
    for (const { name, sql } of stmts) {
      const t0 = Date.now();
      await pool.query(sql);
      console.log(`  ${name}: OK (${Date.now() - t0}ms)`);
    }

    const r = await pool.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'BidOutcome'
        AND column_name IN ('actualBidders','actualOpeningIdx')
    `);
    console.log("\n=== 검증 ===");
    for (const c of r.rows) console.log(`  ${c.column_name}: ${c.data_type}`);
  } finally {
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
