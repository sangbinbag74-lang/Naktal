/**
 * 실제 DB 채움율 출력 — monitor 호출용
 */
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
  const pool = new Pool({ connectionString: loadDbUrl(), statement_timeout: 30000 });
  const ranges: [string, string, string][] = [
    ["Pair1 (2012-2017)", "2012-02-01", "2018-01-01"],
    ["Pair2 (2018-2026)", "2018-01-01", "2027-01-01"],
  ];
  for (const [label, start, end] of ranges) {
    const r = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE array_length("selPrdprcIdx",1)>=4)::bigint AS f, COUNT(*)::bigint AS t FROM "BidOpeningDetail" WHERE "openingDate" >= $1::timestamptz AND "openingDate" < $2::timestamptz`,
      [start, end],
    );
    const f = Number(r.rows[0].f), t = Number(r.rows[0].t);
    const pct = t > 0 ? (f / t * 100).toFixed(1) : "0.0";
    process.stdout.write(`  ${label}: ${f.toLocaleString()}/${t.toLocaleString()} (${pct}%)\n`);
  }
  // Announcement subCategories
  const a = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE array_length("subCategories",1)>0)::bigint AS f, COUNT(*)::bigint AS t FROM "Announcement"`,
  );
  const af = Number(a.rows[0].f), at = Number(a.rows[0].t);
  process.stdout.write(`  Announcement.subCategories: ${af.toLocaleString()}/${at.toLocaleString()} (${(af/at*100).toFixed(1)}%)\n`);
  await pool.end();
})();
