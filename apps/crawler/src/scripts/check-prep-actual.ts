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
const pool = new Pool({ connectionString: dbUrl, max: 1 });

const ALL_125_YMS = [
  "200201","200203","200204","200205","200206","200207","200208","200209","200210","200211","200212",
  "200301","200302","200303","200305","200310","200311","200401","200402","200403","200409","200410",
  "200501","200502","200503","200506","200508","200509","200601","200602","200603","200701","200703","200704",
  "200801","200802","200803","200901","201001","201007","201009","201010","201101","201102","201201",
  "201301","201303","201401","201402","201403","201404","201407","201408","201411","201501","201502","201503","201504","201508","201509","201511","201601","201602",
  "201603","201606","201607","201608","201609","201610","201611","201701","201702","201711","201801","201810","201811","201901","201910","201911","202001","202002","202006","202007","202008","202009","202010","202011","202012","202101","202102","202103","202104","202105","202106","202107","202108","202109","202110","202111","202112",
  "202201","202202","202203","202204","202205","202206","202207","202208","202209","202210","202211","202301","202310","202311","202401","202404","202405","202409","202410","202411","202501","202502","202510","202511","202601",
];

(async () => {
  console.log(`총 125 ym 검증 시작...`);
  const filled: string[] = [];
  const empty: string[] = [];
  const partial: { ym: string; total: number; sel: number; pct: number }[] = [];
  for (const ym of ALL_125_YMS) {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE COALESCE(array_length("selPrdprcIdx",1),0) > 0)::int AS sel
       FROM "BidOpeningDetail" WHERE "annId" LIKE $1`,
      [ym + "%"],
    );
    const total = r.rows[0].total;
    const sel = r.rows[0].sel;
    if (total === 0) empty.push(ym);
    else {
      const pct = sel / total;
      if (pct >= 0.05) filled.push(ym);
      else partial.push({ ym, total, sel, pct });
    }
  }
  console.log(`\n=== 결과 ===`);
  console.log(`채움 (>5% selPrdprcIdx): ${filled.length} ym`);
  console.log(`부분 (<5%): ${partial.length} ym`);
  console.log(`빈 (0 row): ${empty.length} ym`);
  if (empty.length > 0) {
    console.log(`\n빈 ym list:`);
    console.log(empty.join(" "));
  }
  if (partial.length > 0) {
    console.log(`\n부분 ym list (총/선택/%):`);
    for (const p of partial) console.log(`  ${p.ym} ${p.total}/${p.sel} ${(p.pct * 100).toFixed(1)}%`);
  }
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
