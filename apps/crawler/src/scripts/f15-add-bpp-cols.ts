/**
 * F15: BidPricePrediction 에 영구 분석용 컬럼 4개 추가
 * - originalSampleSize: 발주처 통계 원본 표본수 (확장 전)
 * - blendedSampleSize: ALL blend 적용 후 표본수
 * - isBlended: 자동 확장 적용 여부
 * - priceMethod: 가격결정방식 (복수예가/단일예가/비예가)
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
      { name: "originalSampleSize", sql: `ALTER TABLE "BidPricePrediction" ADD COLUMN IF NOT EXISTS "originalSampleSize" integer` },
      { name: "blendedSampleSize",  sql: `ALTER TABLE "BidPricePrediction" ADD COLUMN IF NOT EXISTS "blendedSampleSize" integer` },
      { name: "isBlended",          sql: `ALTER TABLE "BidPricePrediction" ADD COLUMN IF NOT EXISTS "isBlended" boolean DEFAULT false` },
      { name: "priceMethod",        sql: `ALTER TABLE "BidPricePrediction" ADD COLUMN IF NOT EXISTS "priceMethod" text` },
    ];
    for (const { name, sql } of stmts) {
      const t0 = Date.now();
      await pool.query(sql);
      console.log(`  ${name}: OK (${Date.now() - t0}ms)`);
    }

    const r = await pool.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'BidPricePrediction'
        AND column_name IN ('originalSampleSize','blendedSampleSize','isBlended','priceMethod')
      ORDER BY column_name
    `);
    console.log("\n=== 검증 ===");
    for (const c of r.rows) console.log(`  ${c.column_name}: ${c.data_type}`);
  } finally {
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
