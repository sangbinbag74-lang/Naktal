/**
 * BidRequest 에 계약 시점 통계 스냅샷 컬럼 추가
 * - 결과 페이지에서 매번 재계산하지 않고 계약 시점 값을 그대로 표시
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    process.stdout.write("START\n");
    const stmts = [
      `ALTER TABLE "BidRequest" ADD COLUMN IF NOT EXISTS "snapshotAvgSajungRate" numeric(10,4)`,
      `ALTER TABLE "BidRequest" ADD COLUMN IF NOT EXISTS "snapshotSampleSize" integer`,
      `ALTER TABLE "BidRequest" ADD COLUMN IF NOT EXISTS "snapshotCategoryAvg" numeric(10,4)`,
      `ALTER TABLE "BidRequest" ADD COLUMN IF NOT EXISTS "snapshotCategoryTotal" integer`,
      `ALTER TABLE "BidRequest" ADD COLUMN IF NOT EXISTS "snapshotConfidence" text`,
    ];
    for (const sql of stmts) {
      const t0 = Date.now();
      await p.query(sql);
      process.stdout.write(`  OK (${Date.now() - t0}ms): ${sql.slice(0, 80)}\n`);
    }
    const r = await p.query(`SELECT column_name FROM information_schema.columns WHERE table_name='BidRequest' AND column_name LIKE 'snapshot%' ORDER BY column_name`);
    process.stdout.write("COLS=" + r.rows.map(x => x.column_name).join(",") + "\n");
    process.stdout.write("DONE\n");
  } catch (e) {
    process.stderr.write("ERR=" + (e as Error).message + "\n");
  } finally {
    await p.end();
    process.exit(0);
  }
})();
