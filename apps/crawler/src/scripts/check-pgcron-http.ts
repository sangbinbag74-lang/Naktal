/** 읽기 전용 — pg_cron 잡 중 naktal.me HTTP 호출(CRON_SECRET 의존) 여부 확인 */
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
  try {
    const jobs = await c.query(`SELECT jobid, schedule, active, LEFT(command, 160) AS cmd FROM cron.job ORDER BY jobid`);
    if (!jobs.rows.length) { console.log("pg_cron 잡 없음"); }
    for (const r of jobs.rows) console.log(`#${r.jobid} [${r.active ? "on" : "off"}] ${r.schedule} | ${String(r.cmd).replace(/\s+/g, " ")}`);
  } catch (e) {
    console.log("pg_cron 조회 불가:", (e as Error).message);
  }
  c.release(); await pool.end();
})();
