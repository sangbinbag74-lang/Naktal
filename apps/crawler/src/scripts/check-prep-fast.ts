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
    SELECT SUBSTRING("annId" FROM 1 FOR 6) AS ym,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE COALESCE(array_length("selPrdprcIdx",1),0) > 0)::int AS sel,
           COUNT(*) FILTER (WHERE jsonb_array_length("prdprcList") > 1)::int AS prep
    FROM "BidOpeningDetail"
    WHERE "annId" ~ '^[0-9]{6}'
    GROUP BY 1 ORDER BY 1
  `);
  console.log(`=== 125 ym 결과 ===`);
  const ALL = ["200201","200203","200204","200205","200206","200207","200208","200209","200210","200211","200212","200301","200302","200303","200305","200310","200311","200401","200402","200403","200409","200410","200501","200502","200503","200506","200508","200509","200601","200602","200603","200701","200703","200704","200801","200802","200803","200901","201001","201007","201009","201010","201101","201102","201201","201301","201303","201401","201402","201403","201404","201407","201408","201411","201501","201502","201503","201504","201508","201509","201511","201601","201602","201603","201606","201607","201608","201609","201610","201611","201701","201702","201711","201801","201810","201811","201901","201910","201911","202001","202002","202006","202007","202008","202009","202010","202011","202012","202101","202102","202103","202104","202105","202106","202107","202108","202109","202110","202111","202112","202201","202202","202203","202204","202205","202206","202207","202208","202209","202210","202211","202301","202310","202311","202401","202404","202405","202409","202410","202411","202501","202502","202510","202511","202601"];
  const map = new Map<string, { total: number; sel: number; prep: number }>();
  for (const row of r.rows) map.set(row.ym, { total: row.total, sel: row.sel, prep: row.prep });
  let filled = 0, partial = 0, empty = 0;
  const partials: string[] = []; const empties: string[] = [];
  for (const ym of ALL) {
    const v = map.get(ym);
    if (!v || v.total === 0) { empty++; empties.push(ym); continue; }
    const pct = v.prep / v.total;
    if (pct >= 0.95) filled++;
    else { partial++; partials.push(`${ym} ${v.total}/${v.prep} ${(pct*100).toFixed(0)}%`); }
  }
  console.log(`전체 채움 (≥95%): ${filled}/125`);
  console.log(`부분 (<95%): ${partial}`);
  if (partials.length > 0) console.log(`부분 list:\n  ${partials.join("\n  ")}`);
  console.log(`빈 (0): ${empty}`);
  if (empties.length > 0) console.log(`빈 list: ${empties.join(" ")}`);
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
