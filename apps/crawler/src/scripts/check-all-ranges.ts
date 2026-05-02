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
  return process.env.DATABASE_URL!;
}
(async () => {
  const pool = new Pool({ connectionString: loadDbUrl(), statement_timeout: 120000 });
  process.stdout.write("=== BidOpeningDetail (selPrdprcIdx) 전 구간 채움율 ===\n");
  const r = await pool.query(`
    SELECT to_char(date_trunc('month', "openingDate"), 'YYYY-MM') AS ym,
           COUNT(*) FILTER (WHERE array_length("selPrdprcIdx", 1) >= 4)::bigint AS filled,
           COUNT(*)::bigint AS total
    FROM "BidOpeningDetail"
    WHERE "openingDate" >= '2002-01-01' AND "openingDate" < '2027-01-01'
    GROUP BY 1 ORDER BY 1
  `);
  let totalFilled = 0, totalAll = 0;
  for (const row of r.rows) {
    const f = Number(row.filled), t = Number(row.total);
    totalFilled += f; totalAll += t;
    const pct = t > 0 ? (f/t*100).toFixed(1) : "0.0";
    const tag = pct === "0.0" ? " 🔴 EMPTY" : Number(pct) < 50 ? " 🟠" : "";
    process.stdout.write(`${row.ym}: ${f}/${t} (${pct}%)${tag}\n`);
  }
  process.stdout.write(`\n전체: ${totalFilled}/${totalAll} (${(totalFilled/totalAll*100).toFixed(1)}%)\n`);

  process.stdout.write("\n=== Announcement (subCategories) 전 구간 ===\n");
  const r2 = await pool.query(`
    SELECT to_char(date_trunc('month', deadline), 'YYYY-MM') AS ym,
           COUNT(*) FILTER (WHERE array_length("subCategories", 1) > 0)::bigint AS filled,
           COUNT(*)::bigint AS total
    FROM "Announcement"
    WHERE deadline >= '2002-01-01' AND deadline < '2027-01-01'
    GROUP BY 1 ORDER BY 1
  `);
  let s2f = 0, s2t = 0;
  for (const row of r2.rows) {
    const f = Number(row.filled), t = Number(row.total);
    s2f += f; s2t += t;
    const pct = t > 0 ? (f/t*100).toFixed(1) : "0.0";
    const tag = Number(pct) < 30 ? " 🔴" : Number(pct) < 70 ? " 🟠" : "";
    process.stdout.write(`${row.ym}: ${f}/${t} (${pct}%)${tag}\n`);
  }
  process.stdout.write(`\n전체: ${s2f}/${s2t} (${(s2f/s2t*100).toFixed(1)}%)\n`);

  await pool.end();
})();
