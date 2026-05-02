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
  console.log("=== rawJson 안에 9개 필드 키 존재율 ===");
  const r = await c.query(`
    WITH s AS (SELECT "rawJson" FROM "Announcement" TABLESAMPLE SYSTEM(0.5))
    SELECT COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "rawJson" ? 'ciblAplYn')::bigint AS k_cibl,
      COUNT(*) FILTER (WHERE "rawJson" ? 'mtltyAdvcPsblYn')::bigint AS k_mtlty,
      COUNT(*) FILTER (WHERE "rawJson" ? 'jntcontrctDutyRgnNm1')::bigint AS k_jnt1,
      COUNT(*) FILTER (WHERE "rawJson" ? 'jntcontrctDutyRgnNm2')::bigint AS k_jnt2,
      COUNT(*) FILTER (WHERE "rawJson" ? 'jntcontrctDutyRgnNm3')::bigint AS k_jnt3,
      COUNT(*) FILTER (WHERE "rawJson" ? 'rgnDutyJntcontrctRt')::bigint AS k_rt,
      COUNT(*) FILTER (WHERE "rawJson" ? 'rgnDutyJntcontrctYn')::bigint AS k_rtyn,
      COUNT(*) FILTER (WHERE "rawJson" ? 'cnstrtsiteRgnNm')::bigint AS k_cnstr,
      COUNT(*) FILTER (WHERE "rawJson" ? 'bidQlfctRgstDt')::bigint AS k_qlfct,
      COUNT(*) FILTER (WHERE "rawJson" IS NOT NULL)::bigint AS has_raw
    FROM s
  `);
  const x = r.rows[0]; const t = Number(x.total);
  const pct = (n: any) => `${((Number(n)/t)*100).toFixed(1)}%`;
  console.log(`  total                 : ${t.toLocaleString()}`);
  console.log(`  rawJson IS NOT NULL   : ${Number(x.has_raw).toLocaleString()} (${pct(x.has_raw)})`);
  console.log(`  키 'ciblAplYn'        : ${Number(x.k_cibl).toLocaleString()} (${pct(x.k_cibl)})`);
  console.log(`  키 'mtltyAdvcPsblYn'  : ${Number(x.k_mtlty).toLocaleString()} (${pct(x.k_mtlty)})`);
  console.log(`  키 'jntcontrctDutyRgnNm1' : ${Number(x.k_jnt1).toLocaleString()} (${pct(x.k_jnt1)})`);
  console.log(`  키 'jntcontrctDutyRgnNm2' : ${Number(x.k_jnt2).toLocaleString()} (${pct(x.k_jnt2)})`);
  console.log(`  키 'jntcontrctDutyRgnNm3' : ${Number(x.k_jnt3).toLocaleString()} (${pct(x.k_jnt3)})`);
  console.log(`  키 'rgnDutyJntcontrctRt'  : ${Number(x.k_rt).toLocaleString()} (${pct(x.k_rt)})`);
  console.log(`  키 'rgnDutyJntcontrctYn'  : ${Number(x.k_rtyn).toLocaleString()} (${pct(x.k_rtyn)})`);
  console.log(`  키 'cnstrtsiteRgnNm'      : ${Number(x.k_cnstr).toLocaleString()} (${pct(x.k_cnstr)})`);
  console.log(`  키 'bidQlfctRgstDt'       : ${Number(x.k_qlfct).toLocaleString()} (${pct(x.k_qlfct)})`);

  console.log("\n=== rawJson 키 비-빈 값 비율 (값이 실제로 들어있는가) ===");
  const r3 = await c.query(`
    WITH s AS (SELECT "rawJson" FROM "Announcement" TABLESAMPLE SYSTEM(0.5) WHERE "rawJson" IS NOT NULL)
    SELECT
      COUNT(*) FILTER (WHERE NULLIF("rawJson"->>'jntcontrctDutyRgnNm1','') IS NOT NULL)::bigint AS jnt1,
      COUNT(*) FILTER (WHERE NULLIF("rawJson"->>'jntcontrctDutyRgnNm2','') IS NOT NULL)::bigint AS jnt2,
      COUNT(*) FILTER (WHERE NULLIF("rawJson"->>'rgnDutyJntcontrctRt','') IS NOT NULL)::bigint AS rt,
      COUNT(*) FILTER (WHERE NULLIF("rawJson"->>'rgnDutyJntcontrctYn','') IS NOT NULL)::bigint AS rtyn,
      COUNT(*) FILTER (WHERE NULLIF("rawJson"->>'cnstrtsiteRgnNm','') IS NOT NULL)::bigint AS cnstr,
      COUNT(*)::bigint AS total
    FROM s
  `);
  const r3r = r3.rows[0]; const t3 = Number(r3r.total);
  const p3 = (n: any) => `${((Number(n)/t3)*100).toFixed(1)}%`;
  console.log(`  표본 ${t3.toLocaleString()}건`);
  console.log(`  jntcontrctDutyRgnNm1 비-빈 : ${Number(r3r.jnt1).toLocaleString()} (${p3(r3r.jnt1)})`);
  console.log(`  jntcontrctDutyRgnNm2 비-빈 : ${Number(r3r.jnt2).toLocaleString()} (${p3(r3r.jnt2)})`);
  console.log(`  rgnDutyJntcontrctRt  비-빈 : ${Number(r3r.rt).toLocaleString()} (${p3(r3r.rt)})`);
  console.log(`  rgnDutyJntcontrctYn  비-빈 : ${Number(r3r.rtyn).toLocaleString()} (${p3(r3r.rtyn)})`);
  console.log(`  cnstrtsiteRgnNm      비-빈 : ${Number(r3r.cnstr).toLocaleString()} (${p3(r3r.cnstr)})`);

  console.log("\n=== rawJson 샘플 키 목록 5건 ===");
  const r2 = await c.query(`SELECT "konepsId", jsonb_object_keys("rawJson") AS k FROM "Announcement" WHERE "rawJson" IS NOT NULL ORDER BY random() LIMIT 50`);
  const grouped: Record<string, string[]> = {};
  for (const row of r2.rows) { (grouped[row.konepsId] ||= []).push(row.k); }
  let count = 0;
  for (const [k, keys] of Object.entries(grouped)) {
    if (count++ >= 3) break;
    console.log(`  ${k}: [${keys.slice(0, 25).join(", ")}${keys.length > 25 ? ", ..." : ""}] (${keys.length} 개)`);
  }

  c.release(); await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
