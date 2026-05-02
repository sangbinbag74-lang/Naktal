import { Pool } from "pg";
import * as fs from "fs"; import * as path from "path";
function loadDb() {
  const env = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(env, "utf-8");
  for (const l of c.split("\n")) { const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i === -1) continue;
    const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "DATABASE_URL" && v) return v; } throw new Error();
}
(async () => {
  const pool = new Pool({ connectionString: loadDb(), max: 1, statement_timeout: 120000 });
  const c = await pool.connect();
  const ddls = [
    `ALTER TABLE "Announcement" DROP COLUMN IF EXISTS "prtcptPsblRgnNm"`,
    `ALTER TABLE "Announcement" DROP COLUMN IF EXISTS "jntcontrctDutyRgnNm"`,
    `ALTER TABLE "AnnouncementChgHst" DROP COLUMN IF EXISTS "chgRsnNm"`,
    `ALTER TABLE "AnnouncementChgHst" DROP COLUMN IF EXISTS "chgBefore"`,
    `ALTER TABLE "AnnouncementChgHst" DROP COLUMN IF EXISTS "chgAfter"`,
  ];
  for (const sql of ddls) {
    process.stdout.write(`${sql} ... `);
    const t0 = Date.now();
    try {
      await c.query(sql);
      console.log(`OK (${((Date.now()-t0)/1000).toFixed(1)}s)`);
    } catch (e: any) {
      console.log(`FAIL: ${e.message}`);
    }
  }
  console.log("\n=== DROP 후 잔존 확인 ===");
  const r = await c.query(`SELECT table_name, column_name FROM information_schema.columns
    WHERE (table_name = 'Announcement' AND column_name IN ('prtcptPsblRgnNm','jntcontrctDutyRgnNm'))
       OR (table_name = 'AnnouncementChgHst' AND column_name IN ('chgRsnNm','chgBefore','chgAfter'))`);
  if (r.rowCount === 0) console.log("  ✅ 5개 컬럼 모두 DROP 완료");
  else for (const x of r.rows) console.log(`  ❌ 잔존: ${x.table_name}.${x.column_name}`);
  c.release(); await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
