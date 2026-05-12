import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") dbUrl = v;
}
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 60000 });

(async () => {
  console.log("=== 1. SajungRateStat 테이블 ===");
  const r1 = await pool.query(`SELECT COUNT(*)::int AS n, MAX("updatedAt") AS last_update FROM "SajungRateStat"`);
  console.log(`  total=${r1.rows[0].n}`);
  console.log(`  last_update=${r1.rows[0].last_update}`);

  console.log("\n=== 2. collect_sajung_stat DB 함수 정의 ===");
  const r2 = await pool.query(`
    SELECT proname, pg_get_function_arguments(oid) AS args, pg_get_function_result(oid) AS ret
    FROM pg_proc WHERE proname = 'collect_sajung_stat'
  `);
  if (r2.rows.length === 0) {
    console.log("  ★ DB 함수 등록 안 됨 — pg_cron 으로 SELECT collect_sajung_stat() 호출됐다면 DB 함수임");
  } else {
    for (const row of r2.rows) console.log(`  ${row.proname}(${row.args}) → ${row.ret}`);
  }

  console.log("\n=== 3. pg_cron 등록된 job ===");
  try {
    const r3 = await pool.query(`SELECT jobid, jobname, schedule, command, active FROM cron.job WHERE command ILIKE '%sajung%' OR jobname ILIKE '%sajung%'`);
    if (r3.rows.length === 0) console.log("  pg_cron sajung job 없음");
    else for (const row of r3.rows) console.log(`  job=${row.jobname} sched=${row.schedule} cmd=${row.command.slice(0, 60)}`);
  } catch (e) {
    console.log(`  pg_cron 접근 불가: ${(e as Error).message.slice(0, 80)}`);
  }

  console.log("\n=== 4. 현재 활성 collect_sajung_stat ===");
  const r4 = await pool.query(`SELECT pid, EXTRACT(EPOCH FROM (NOW() - query_start))::int AS dur_s FROM pg_stat_activity WHERE state = 'active' AND query ILIKE '%collect_sajung_stat%'`);
  if (r4.rows.length === 0) console.log("  현재 실행 중 X");
  else for (const row of r4.rows) console.log(`  pid=${row.pid} dur=${row.dur_s}s`);

  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
