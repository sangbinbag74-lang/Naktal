/**
 * BidRequest 에 의뢰/계약 감사용 컬럼 5개 추가
 * 박상빈님 5/18 명시 — 의뢰 더보기에 소송/연락 가능한 모든 정보 표시
 *
 * 실행: pnpm ts-node src/scripts/add-bidrequest-audit-cols.ts
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
      { name: "createdIp",         sql: `ALTER TABLE "BidRequest" ADD COLUMN IF NOT EXISTS "createdIp" TEXT` },
      { name: "createdUserAgent",  sql: `ALTER TABLE "BidRequest" ADD COLUMN IF NOT EXISTS "createdUserAgent" TEXT` },
      { name: "createdReferer",    sql: `ALTER TABLE "BidRequest" ADD COLUMN IF NOT EXISTS "createdReferer" TEXT` },
      { name: "contractUserAgent", sql: `ALTER TABLE "BidRequest" ADD COLUMN IF NOT EXISTS "contractUserAgent" TEXT` },
      { name: "supabaseSessionId", sql: `ALTER TABLE "BidRequest" ADD COLUMN IF NOT EXISTS "supabaseSessionId" TEXT` },
    ];
    for (const { name, sql } of stmts) {
      const t0 = Date.now();
      await pool.query(sql);
      console.log(`  ${name}: OK (${Date.now() - t0}ms)`);
    }

    const r = await pool.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'BidRequest'
        AND column_name IN ('createdIp','createdUserAgent','createdReferer','contractUserAgent','supabaseSessionId')
      ORDER BY column_name
    `);
    console.log("\n=== 검증 ===");
    for (const c of r.rows) console.log(`  ${c.column_name}: ${c.data_type}`);
  } finally {
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
