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
  const pool = new Pool({ connectionString: loadDbUrl(), statement_timeout: 60000 });
  const months = [
    ["2012-02", "2012-02-01", "2012-03-01"],
    ["2012-03", "2012-03-01", "2012-04-01"],
    ["2024-03", "2024-03-01", "2024-04-01"],
    ["2024-12", "2024-12-01", "2025-01-01"],
    ["2025-06", "2025-06-01", "2025-07-01"],
    ["2026-03", "2026-03-01", "2026-04-01"],
  ];
  for (const [label, s, e] of months) {
    const r = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE array_length("selPrdprcIdx",1)>=4)::bigint AS f, COUNT(*)::bigint AS t FROM "BidOpeningDetail" WHERE "openingDate" >= $1::timestamptz AND "openingDate" < $2::timestamptz`,
      [s, e],
    );
    const f = Number(r.rows[0].f), t = Number(r.rows[0].t);
    process.stdout.write(`${label}: ${f.toLocaleString()}/${t.toLocaleString()} (${(f/t*100).toFixed(1)}%)\n`);
  }
  await pool.end();
})();
