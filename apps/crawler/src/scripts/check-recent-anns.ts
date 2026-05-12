import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") dbUrl = v;
}
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 0 });

(async () => {
  const r = await pool.query(`
    SELECT
      DATE("deadline") AS d,
      COUNT(*)::int AS total,
      MAX("createdAt") AS latest_created
    FROM "Announcement"
    WHERE "deadline" >= NOW() - INTERVAL '30 days'
      AND "deadline" < NOW() + INTERVAL '60 days'
    GROUP BY 1 ORDER BY 1 DESC
  `);
  console.log("=== 최근 30일 + 향후 60일 deadline 별 공고 수 ===");
  console.log("date       | total | latest createdAt");
  console.log("-----------|-------|---------------------");
  for (const row of r.rows) {
    console.log(`${row.d.toISOString().slice(0,10)} | ${String(row.total).padStart(5)} | ${row.latest_created?.toISOString().slice(0,16) || "-"}`);
  }
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
