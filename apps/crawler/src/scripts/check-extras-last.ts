import { Pool } from "pg";
import * as fs from "fs"; import * as path from "path";
let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") dbUrl = v;
}
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 20000 });
(async () => {
  // AnnouncementChgHst 최근 INSERT 의 deadline ym 분포 (worker 가 어디까지 처리했는지)
  const r = await pool.query(`
    SELECT to_char(a.deadline, 'YYYY-MM') AS ym, COUNT(*)::int AS c
    FROM "AnnouncementChgHst" h
    JOIN "Announcement" a ON h."annId" = a.id
    WHERE h."createdAt" > NOW() - INTERVAL '30 minutes'
      AND a.deadline >= '2020-01-01' AND a.deadline <= '2026-05-31'
    GROUP BY ym ORDER BY ym
  `);
  console.log(`최근 30분 INSERT (202001~202605 worker): ${r.rows.length}개 ym`);
  for (const row of r.rows) console.log(`  ${row.ym}: ${row.c}건`);
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
