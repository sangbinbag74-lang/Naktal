import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") dbUrl = v;
}
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 0 });

(async () => {
  const r = await pool.query(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "aValueYn" = 'Y')::bigint AS avalueY,
      COUNT(*) FILTER (WHERE "aValueAmt"::text != '0')::bigint AS avalueAmt,
      COUNT(*) FILTER (WHERE "aValueTotal"::text != '0')::bigint AS avalueTotal,
      COUNT(*) FILTER (WHERE "bsisAmt"::text != '0')::bigint AS bsisAmt,
      COUNT(*) FILTER (WHERE "priceRangeRate" != '')::bigint AS prRate
    FROM "Announcement"
  `);
  const row = r.rows[0];
  const total = Number(row.total);
  const fmt = (label: string, n: any) => {
    const v = Number(n);
    return `  ${label.padEnd(22)} ${v.toLocaleString().padStart(10)} (${((v / total) * 100).toFixed(2)}%)`;
  };
  console.log(`=== aValue / bsisAmt 채움률 (전체) total=${total.toLocaleString()} ===`);
  console.log(fmt("aValueYn = 'Y'", row.avalueY));
  console.log(fmt("aValueAmt > 0", row.avalueAmt));
  console.log(fmt("aValueTotal > 0", row.avalueTotal));
  console.log(fmt("bsisAmt > 0", row.bsisAmt));
  console.log(fmt("priceRangeRate != ''", row.prRate));

  const r2 = await pool.query(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "aValueYn" = 'Y')::bigint AS avalueY,
      COUNT(*) FILTER (WHERE "aValueTotal"::text != '0')::bigint AS avalueTotal,
      COUNT(*) FILTER (WHERE "bsisAmt"::text != '0')::bigint AS bsisAmt
    FROM "Announcement"
    WHERE "category" LIKE '%공사%' OR "category" = '시설공사'
  `);
  const r2t = Number(r2.rows[0].total);
  console.log(`\n=== Cnstwk 한정 total=${r2t.toLocaleString()} ===`);
  const fmt2 = (label: string, n: any) => {
    const v = Number(n);
    return `  ${label.padEnd(22)} ${v.toLocaleString().padStart(10)} (${((v / r2t) * 100).toFixed(2)}%)`;
  };
  console.log(fmt2("aValueYn = 'Y'", r2.rows[0].avalueY));
  console.log(fmt2("aValueTotal > 0", r2.rows[0].avalueTotal));
  console.log(fmt2("bsisAmt > 0", r2.rows[0].bsisAmt));

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
