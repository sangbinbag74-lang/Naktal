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
  const pool = new Pool({ connectionString: loadDb(), max: 1, statement_timeout: 600000 });
  const c = await pool.connect();
  console.log("=== DROP 대상 컬럼의 비-빈 데이터 건수 ===");
  const r1 = await c.query(`
    SELECT
      COUNT(*) FILTER (WHERE "prtcptPsblRgnNm" IS NOT NULL AND "prtcptPsblRgnNm" != '')::bigint AS p_count,
      COUNT(*) FILTER (WHERE "jntcontrctDutyRgnNm" IS NOT NULL AND "jntcontrctDutyRgnNm" != '')::bigint AS j_count
    FROM "Announcement"
  `);
  console.log(`  Announcement.prtcptPsblRgnNm : ${Number(r1.rows[0].p_count).toLocaleString()}`);
  console.log(`  Announcement.jntcontrctDutyRgnNm : ${Number(r1.rows[0].j_count).toLocaleString()}`);
  const r2 = await c.query(`
    SELECT
      COUNT(*) FILTER (WHERE "chgRsnNm" IS NOT NULL AND "chgRsnNm" != '')::bigint AS r_count,
      COUNT(*) FILTER (WHERE "chgBefore" IS NOT NULL)::bigint AS b_count,
      COUNT(*) FILTER (WHERE "chgAfter" IS NOT NULL)::bigint AS a_count
    FROM "AnnouncementChgHst"
  `);
  console.log(`  AnnouncementChgHst.chgRsnNm : ${Number(r2.rows[0].r_count).toLocaleString()}`);
  console.log(`  AnnouncementChgHst.chgBefore : ${Number(r2.rows[0].b_count).toLocaleString()}`);
  console.log(`  AnnouncementChgHst.chgAfter : ${Number(r2.rows[0].a_count).toLocaleString()}`);
  c.release(); await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
