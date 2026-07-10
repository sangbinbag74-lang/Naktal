/** 읽기 전용 — realtime-snapshot cron 가동 검증 (COUNT + 표본 10건 + 정합) */
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

  const cnt = await c.query(`SELECT COUNT(*)::bigint AS n, MIN("snapshotAt") AS first, MAX("snapshotAt") AS last FROM "ParticipantSnapshot"`);
  const row = cnt.rows[0];
  console.log(`ParticipantSnapshot 총 ${Number(row.n).toLocaleString()}건 · 최초 ${row.first ?? "-"} · 최종 ${row.last ?? "-"}`);

  if (Number(row.n) === 0) { console.log("→ 아직 0건 (cron 미실행 또는 실패)"); c.release(); await pool.end(); return; }

  // 표본 10건 — count 값 + Announcement 조인 + BidResult.numBidders 대조
  const sample = await c.query(`
    SELECT ps.count, ps."snapshotAt", a."konepsId", a.title, a.deadline, br."numBidders"
    FROM "ParticipantSnapshot" ps
    JOIN "Announcement" a ON a.id = ps."annId"
    LEFT JOIN "BidResult" br ON br."annId" = a."konepsId"
    ORDER BY ps."snapshotAt" DESC
    LIMIT 10
  `);
  console.log("\n표본 10건 (스냅샷 count vs BidResult.numBidders):");
  for (const r of sample.rows) {
    const match = r.numBidders == null ? "(프로브·결과 미수집)" : (Number(r.count) === Number(r.numBidders) ? "일치" : `불일치 br=${r.numBidders}`);
    console.log(`  ${String(r.snapshotAt).slice(0, 19)} | ${r.konepsId} | ${String(r.title).slice(0, 34)} | count=${r.count} ${match}`);
  }

  // count 분포 상식 검증
  const distq = await c.query(`SELECT MIN(count) AS mn, ROUND(AVG(count),1) AS avg, MAX(count) AS mx, COUNT(*) FILTER (WHERE count <= 0)::bigint AS bad FROM "ParticipantSnapshot"`);
  const d = distq.rows[0];
  console.log(`\ncount 분포: min ${d.mn} / avg ${d.avg} / max ${d.mx} · 0이하 ${d.bad}건 (0 기대)`);

  c.release(); await pool.end();
})();
