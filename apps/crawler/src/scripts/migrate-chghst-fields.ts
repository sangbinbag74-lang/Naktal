/**
 * AnnouncementChgHst에 chgItemNm, bfChgVal, afChgVal 컬럼 추가 (if not exists)
 * Prisma migrate 우회 — 기존 DB 직접 ALTER
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadDbUrl(): string {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(rootEnv, "utf-8");
  for (const l of c.split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "DATABASE_URL" && v) return v;
  }
  return process.env.DATABASE_URL!;
}

(async () => {
  const pool = new Pool({ connectionString: loadDbUrl(), statement_timeout: 60000 });
  try {
    console.log("ALTER TABLE AnnouncementChgHst 추가 컬럼...");
    await pool.query(`
      ALTER TABLE "AnnouncementChgHst"
        ADD COLUMN IF NOT EXISTS "chgItemNm" TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "bfChgVal"  TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "afChgVal"  TEXT NOT NULL DEFAULT ''
    `);
    console.log("[OK] 컬럼 추가 완료");

    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='AnnouncementChgHst' ORDER BY ordinal_position`,
    );
    console.log("현재 컬럼:", cols.rows.map((r) => r.column_name).join(", "));
  } finally {
    await pool.end();
  }
})();
