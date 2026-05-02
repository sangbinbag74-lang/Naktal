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
  console.log("=== reparse 후 9개 필드 채움율 ===");
  const r = await c.query(`
    SELECT COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "ciblAplYn" != '')::bigint AS cibl,
      COUNT(*) FILTER (WHERE "mtltyAdvcPsblYn" != '')::bigint AS mtlty,
      COUNT(*) FILTER (WHERE "jntcontrctDutyRgnNm1" != '')::bigint AS jnt1,
      COUNT(*) FILTER (WHERE "jntcontrctDutyRgnNm2" != '')::bigint AS jnt2,
      COUNT(*) FILTER (WHERE "jntcontrctDutyRgnNm3" != '')::bigint AS jnt3,
      COUNT(*) FILTER (WHERE "rgnDutyJntcontrctRt" != '')::bigint AS rt,
      COUNT(*) FILTER (WHERE "rgnDutyJntcontrctYn" != '')::bigint AS rtyn,
      COUNT(*) FILTER (WHERE "cnstrtsiteRgnNm" != '')::bigint AS cnstr,
      COUNT(*) FILTER (WHERE "bidQlfctRgstDt" IS NOT NULL)::bigint AS qlfct
    FROM "Announcement"
  `);
  const x = r.rows[0]; const t = Number(x.total);
  const pct = (n: any) => `${((Number(n)/t)*100).toFixed(1)}%`;
  console.log(`  total                : ${t.toLocaleString()}`);
  console.log(`  ciblAplYn            : ${Number(x.cibl).toLocaleString()} (${pct(x.cibl)})`);
  console.log(`  mtltyAdvcPsblYn      : ${Number(x.mtlty).toLocaleString()} (${pct(x.mtlty)})`);
  console.log(`  jntcontrctDutyRgnNm1 : ${Number(x.jnt1).toLocaleString()} (${pct(x.jnt1)})`);
  console.log(`  jntcontrctDutyRgnNm2 : ${Number(x.jnt2).toLocaleString()} (${pct(x.jnt2)})`);
  console.log(`  jntcontrctDutyRgnNm3 : ${Number(x.jnt3).toLocaleString()} (${pct(x.jnt3)})`);
  console.log(`  rgnDutyJntcontrctRt  : ${Number(x.rt).toLocaleString()} (${pct(x.rt)})`);
  console.log(`  rgnDutyJntcontrctYn  : ${Number(x.rtyn).toLocaleString()} (${pct(x.rtyn)})`);
  console.log(`  cnstrtsiteRgnNm      : ${Number(x.cnstr).toLocaleString()} (${pct(x.cnstr)})`);
  console.log(`  bidQlfctRgstDt       : ${Number(x.qlfct).toLocaleString()} (${pct(x.qlfct)})`);
  c.release(); await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
