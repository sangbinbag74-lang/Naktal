/** 읽기 전용 — Announcement deadline 인덱스 + 창 쿼리 성능 확인 */
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

  const idx = await c.query(`SELECT indexdef FROM pg_indexes WHERE tablename='Announcement' AND indexdef ILIKE '%deadline%'`);
  console.log("deadline 인덱스:", idx.rows.length ? idx.rows.map((r) => r.indexdef).join("\n  ") : "없음");

  // cron 창 쿼리 성능 (최근 2일 마감)
  const t0 = Date.now();
  const w = await c.query(`SELECT COUNT(*)::bigint AS n FROM "Announcement" WHERE deadline < now() AND deadline >= now() - interval '2 days'`);
  console.log(`최근 2일 마감 공고: ${Number(w.rows[0].n).toLocaleString()}건 (${Date.now() - t0}ms)`);

  // 발주처 창+무정렬 쿼리 성능 (조달청 3개월)
  const t1 = Date.now();
  const o = await c.query(`SELECT COUNT(*)::bigint AS n FROM "Announcement" WHERE "orgName"='조달청' AND deadline < now() AND deadline >= now() - interval '3 months'`);
  console.log(`조달청 3개월 마감: ${Number(o.rows[0].n).toLocaleString()}건 (${Date.now() - t1}ms)`);

  // 조달청 전체 건수 (정렬 비용 근원)
  const t2 = Date.now();
  const tot = await c.query(`SELECT COUNT(*)::bigint AS n FROM "Announcement" WHERE "orgName"='조달청'`);
  console.log(`조달청 전체: ${Number(tot.rows[0].n).toLocaleString()}건 (${Date.now() - t2}ms)`);

  c.release(); await pool.end();
})();
