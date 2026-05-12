/**
 * User 테이블에 회원가입 신규 컬럼 추가
 * - 마케팅 수신동의 (체크박스)
 * - 카카오 본인인증 (비즈앱 통과 후 활성화 대비)
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
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "marketingConsent" BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "marketingConsentAt" TIMESTAMP(3)`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "kakaoId" TEXT`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "kakaoVerifiedName" TEXT`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "kakaoVerifiedPhone" TEXT`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "kakaoVerifiedAt" TIMESTAMP(3)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "User_kakaoId_key" ON "User"("kakaoId") WHERE "kakaoId" IS NOT NULL`,
    ];
    for (const sql of stmts) {
      const t0 = Date.now();
      await p.query(sql);
      process.stdout.write(`  OK (${Date.now() - t0}ms): ${sql.slice(0, 90)}\n`);
    }
    const r = await p.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name='User' AND (column_name LIKE 'marketing%' OR column_name LIKE 'kakao%')
      ORDER BY column_name
    `);
    process.stdout.write("VERIFY:\n");
    for (const row of r.rows) {
      process.stdout.write(`  ${row.column_name} (${row.data_type}, nullable=${row.is_nullable})\n`);
    }
    process.stdout.write("DONE\n");
  } catch (e) {
    process.stderr.write("ERR=" + (e as Error).message + "\n");
    process.exit(1);
  } finally {
    await p.end();
    process.exit(0);
  }
})();
