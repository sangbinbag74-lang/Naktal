/**
 * Announcement 테이블에 적격/공동수급/공사위치 추가 컬럼
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";
function loadDbUrl(): string {
  const c = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
  for (const l of c.split("\n")) {
    const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i < 0) continue;
    if (t.slice(0, i).trim() === "DATABASE_URL") return t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return process.env.DATABASE_URL!;
}
(async () => {
  const pool = new Pool({ connectionString: loadDbUrl(), statement_timeout: 60000 });
  process.stdout.write("ALTER Announcement 추가 컬럼...\n");
  await pool.query(`
    ALTER TABLE "Announcement"
      ADD COLUMN IF NOT EXISTS "jntcontrctDutyRgnNm1" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "jntcontrctDutyRgnNm2" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "jntcontrctDutyRgnNm3" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "rgnDutyJntcontrctRt" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "rgnDutyJntcontrctYn" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "cnstrtsiteRgnNm" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "bidQlfctRgstDt" TIMESTAMPTZ
  `);
  process.stdout.write("[OK] 7개 컬럼 추가 완료\n");
  await pool.end();
})();
