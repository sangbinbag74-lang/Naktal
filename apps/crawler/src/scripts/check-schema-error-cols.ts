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
  const pool = new Pool({ connectionString: loadDb(), max: 1 });
  const c = await pool.connect();
  const targets = [
    { table: "Announcement", col: "prtcptPsblRgnNm" },
    { table: "Announcement", col: "jntcontrctDutyRgnNm" },
    { table: "AnnouncementChgHst", col: "chgRsnNm" },
    { table: "AnnouncementChgHst", col: "chgBefore" },
    { table: "AnnouncementChgHst", col: "chgAfter" },
    { table: "AnnouncementChgHst", col: "chgNtceRsnNm" },
    { table: "AnnouncementChgHst", col: "chgNtceSeq" },
    { table: "AnnouncementChgHst", col: "chgNtceDt" },
  ];
  console.log("=== schema-error 컬럼 DB 존재 여부 ===");
  for (const { table, col } of targets) {
    const r = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`, [table, col]);
    console.log(`  ${table}.${col} : ${r.rowCount ? "✅ EXISTS" : "❌ NOT FOUND"}`);
  }
  c.release(); await pool.end();
})();
