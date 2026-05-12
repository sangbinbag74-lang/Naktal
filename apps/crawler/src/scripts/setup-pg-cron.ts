import { Pool } from "pg";
import * as fs from "fs"; import * as path from "path";
let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) { const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") dbUrl = v; }
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 30000 });
(async () => {
  console.log("=== 1. pg_cron 확장 활성화 ===");
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_cron`);
    console.log("  OK");
  } catch (e) {
    console.log(`  실패: ${(e as Error).message}`);
  }
  
  console.log("\n=== 2. 기존 refresh-active job 삭제 (idempotent) ===");
  try {
    await pool.query(`SELECT cron.unschedule('refresh-active')`);
    console.log("  기존 job 삭제");
  } catch (e) {
    console.log(`  (없음 또는 OK): ${(e as Error).message.substring(0,100)}`);
  }
  
  console.log("\n=== 3. 5분 간격 REFRESH cron 등록 ===");
  await pool.query(`
    SELECT cron.schedule(
      'refresh-active',
      '*/5 * * * *',
      $$REFRESH MATERIALIZED VIEW CONCURRENTLY "AnnouncementActive"$$
    )
  `);
  console.log("  등록 완료");
  
  console.log("\n=== 4. 등록 확인 ===");
  const r = await pool.query(`SELECT jobid, jobname, schedule, command, active FROM cron.job WHERE jobname = 'refresh-active'`);
  for (const row of r.rows) {
    console.log(`  jobid=${row.jobid} | ${row.schedule} | active=${row.active}`);
    console.log(`  cmd: ${row.command.substring(0,100)}`);
  }
  await pool.end();
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
