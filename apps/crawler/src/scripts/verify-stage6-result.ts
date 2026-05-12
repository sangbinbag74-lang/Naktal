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
      SUBSTRING("annId", 1, 6) AS ym,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE COALESCE(array_length("selPrdprcIdx",1),0) > 0)::int AS sel_filled,
      COUNT(*) FILTER (WHERE jsonb_array_length("prdprcList") > 1)::int AS prep_filled
    FROM "BidOpeningDetail"
    WHERE SUBSTRING("annId", 1, 6) IN
      ('201801','201810','201811','201901','201910','201911','202001','202002',
       '202006','202007','202008','202009','202010','202011','202012','202101',
       '202102','202103','202104','202105','202106','202107','202108','202109',
       '201611','201701','201702','201711','202110','202111','202112')
    GROUP BY 1 ORDER BY 1
  `);
  console.log("=== Stage 6 처리 30 ym 채움률 ===");
  console.log("ym       | total   | sel_fill |  pct  | prep_fill | pct");
  console.log("---------|---------|----------|-------|-----------|------");
  let sumTotal = 0, sumSel = 0, sumPrep = 0;
  for (const row of r.rows) {
    const total = row.total;
    const sel = row.sel_filled;
    const prep = row.prep_filled;
    const selPct = total > 0 ? (100 * sel / total).toFixed(1) : "0.0";
    const prepPct = total > 0 ? (100 * prep / total).toFixed(1) : "0.0";
    console.log(`${row.ym}  | ${String(total).padStart(7)} | ${String(sel).padStart(8)} | ${selPct.padStart(5)}% | ${String(prep).padStart(9)} | ${prepPct}%`);
    sumTotal += total; sumSel += sel; sumPrep += prep;
  }
  console.log("---------|---------|----------|-------|-----------|------");
  console.log(`전체     | ${String(sumTotal).padStart(7)} | ${String(sumSel).padStart(8)} | ${(100*sumSel/sumTotal).toFixed(1).padStart(5)}% | ${String(sumPrep).padStart(9)} | ${(100*sumPrep/sumTotal).toFixed(1)}%`);

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
