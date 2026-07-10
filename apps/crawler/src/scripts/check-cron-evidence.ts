/** 읽기 전용 — Vercel cron 실행 흔적 조사 (RateLimit 키 + CrawlLog) */
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

  // 1. RateLimit — cron 이 만드는 키 패턴별 최근 7일 생성 수
  const pats: [string, string][] = [
    ["scorecard:%", "scorecard(10:30 KST)"],
    ["cw:%", "competitor-alerts(11:00)"],
    ["subexp:%", "subscription-expiry(08:30)"],
    ["alert:%", "alerts/notify(09:00)"],
    ["notify%", "alerts/notify 변형"],
    ["rtprobe:%", "realtime-snapshot 프로브"],
  ];
  for (const [pat, label] of pats) {
    const r = await c.query(
      `SELECT COUNT(*)::bigint AS n, MAX("updatedAt") AS last FROM "RateLimit" WHERE key LIKE $1`,
      [pat],
    );
    console.log(`${label.padEnd(28)} ${pat.padEnd(14)} → ${r.rows[0].n}건, 최근 ${r.rows[0].last ?? "-"}`);
  }

  // 2. RateLimit 최근 생성 키 15개 (패턴 파악)
  const recent = await c.query(`SELECT key, "updatedAt" FROM "RateLimit" ORDER BY "updatedAt" DESC LIMIT 15`);
  console.log("\n최근 RateLimit 키 15개:");
  for (const r of recent.rows) console.log(`  ${String(r.updatedAt).slice(0, 19)} | ${String(r.key).slice(0, 60)}`);

  // 3. CrawlLog 최근 10건 (sync-g2b 등)
  const logs = await c.query(`SELECT type, status, count, "createdAt" FROM "CrawlLog" ORDER BY "createdAt" DESC LIMIT 10`);
  console.log("\nCrawlLog 최근 10건:");
  for (const r of logs.rows) console.log(`  ${String(r.createdAt).slice(0, 19)} | ${r.type} | ${r.status} | ${r.count}`);

  c.release(); await pool.end();
})();
