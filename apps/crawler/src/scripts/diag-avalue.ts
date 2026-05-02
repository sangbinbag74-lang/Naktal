import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";
function loadDbUrl(): string {
  const c = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
  for (const l of c.split("\n")) {
    const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i < 0) continue;
    if (t.slice(0, i).trim() === "DATABASE_URL") return t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}
(async () => {
  const pool = new Pool({ connectionString: loadDbUrl(), statement_timeout: 60000 });
  const r = await pool.query(`
    SELECT
      category,
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "aValueTotal" > 0)::bigint AS filled
    FROM "Announcement"
    WHERE deadline >= '2002-01-01' AND deadline < '2027-01-01'
    GROUP BY category
    ORDER BY total DESC
  `);
  process.stdout.write("=== category 별 aValueTotal 채움 ===\n");
  for (const row of r.rows) {
    const t = Number(row.total), f = Number(row.filled);
    const pct = t > 0 ? (f/t*100).toFixed(1) : "0.0";
    process.stdout.write(`${row.category || '(NULL)'}: ${f}/${t} (${pct}%)\n`);
  }
  // 연도별 공사 공고만
  const r2 = await pool.query(`
    SELECT
      to_char(date_trunc('year', deadline), 'YYYY') AS y,
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "aValueTotal" > 0)::bigint AS filled
    FROM "Announcement"
    WHERE category = '공사'
      AND deadline >= '2002-01-01' AND deadline < '2027-01-01'
    GROUP BY y ORDER BY y
  `);
  process.stdout.write("\n=== 공사 공고만 연도별 ===\n");
  for (const row of r2.rows) {
    const t = Number(row.total), f = Number(row.filled);
    const pct = t > 0 ? (f/t*100).toFixed(1) : "0.0";
    process.stdout.write(`${row.y}: ${f}/${t} (${pct}%)\n`);
  }
  await pool.end();
})();
