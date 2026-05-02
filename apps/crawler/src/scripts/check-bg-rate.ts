import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
function loadDb() {
  const env = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(env, "utf-8");
  for (const l of c.split("\n")) {
    const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "DATABASE_URL" && v) return v;
  }
  throw new Error();
}
(async () => {
  const pool = new Pool({ connectionString: loadDb(), max: 1, statement_timeout: 30000 });
  const c = await pool.connect();

  // ChgHst 최근 INSERT 누적 (chgDate 분포로 처리 위치 추정)
  const r2 = await c.query(`
    SELECT date_trunc('month', "chgDate") AS ym, COUNT(*)::int AS n
    FROM "AnnouncementChgHst"
    WHERE "createdAt" > NOW() - INTERVAL '30 minutes'
    GROUP BY 1 ORDER BY 1 ASC LIMIT 20
  `);
  console.log(`\n=== 최근 30분 내 INSERT 된 ChgHst 의 chgDate 월별 ===`);
  if (r2.rowCount === 0) console.log("  (없음)");
  for (const r of r2.rows) console.log(`  chgDate ${r.ym?.toISOString().slice(0,7)} : ${r.n.toLocaleString()}`);

  // pg_stat_activity 의 application_name + 쿼리 문 (어떤 INSERT 인지)
  const r3 = await c.query(`
    SELECT pid, state, wait_event_type, wait_event,
           NOW() - query_start AS dur,
           substring(query, 1, 120) AS q
    FROM pg_stat_activity
    WHERE datname = current_database() AND pid != pg_backend_pid() AND state != 'idle'
    ORDER BY query_start
  `);
  console.log(`\n=== 활성 쿼리 ${r3.rowCount}건 ===`);
  for (const r of r3.rows) {
    console.log(`  pid=${r.pid} dur=${r.dur} wait=${r.wait_event_type}/${r.wait_event}`);
    console.log(`    ${r.q?.replace(/\s+/g," ").slice(0,140)}`);
  }

  c.release(); await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
