/**
 * Announcement 에 pdfRgnLimit JSONB 컬럼 추가
 * - 공고문 PDF 본문에서 추출한 자격제한 정보 저장
 * { type: 'sigun' | 'gwangyeok' | 'national' | 'unknown', label: string, raw?: string }
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const t0 = Date.now();
    await pool.query(`ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "pdfRgnLimit" jsonb`);
    await pool.query(`ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "pdfParsedAt" timestamptz`);
    console.log(`  pdfRgnLimit jsonb + pdfParsedAt timestamptz: OK (${Date.now() - t0}ms)`);

    const r = await pool.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'Announcement' AND column_name IN ('pdfRgnLimit','pdfParsedAt')
    `);
    console.log("\n=== 검증 ===");
    for (const c of r.rows) console.log(`  ${c.column_name}: ${c.data_type}`);
  } finally {
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
