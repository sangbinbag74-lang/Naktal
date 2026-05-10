/**
 * BidRequest 에 numberStrategy JSONB 컬럼 추가
 * - 계약 시점의 AI 추천 번호 조합·빈도맵·적중률을 그대로 보관
 * - 결과 페이지에서 매번 재계산하지 않고 저장된 값 그대로 표시
 *
 * 실행: pnpm ts-node src/scripts/add-bid-request-numberstrategy.ts
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
    await pool.query(`ALTER TABLE "BidRequest" ADD COLUMN IF NOT EXISTS "numberStrategy" jsonb`);
    console.log(`  numberStrategy jsonb: OK (${Date.now() - t0}ms)`);

    const r = await pool.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'BidRequest' AND column_name = 'numberStrategy'
    `);
    console.log("\n=== 검증 ===");
    for (const c of r.rows) console.log(`  ${c.column_name}: ${c.data_type}`);
  } finally {
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
