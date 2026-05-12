import { Pool } from "pg";
import * as fs from "fs"; import * as path from "path";
let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) { const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") dbUrl = v; }
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 60000 });
(async () => {
  // 보조 테이블 추정 rowCount (n_live_tup, 즉시)
  console.log("=== 보조 테이블 rowCount (추정) ===");
  const r = await pool.query(`
    SELECT relname, n_live_tup
    FROM pg_stat_user_tables
    WHERE relname IN ('Announcement','AnnouncementChgHst','PreStdrd','BidOpeningDetail','BidResult')
    ORDER BY relname
  `);
  for (const row of r.rows) console.log(`  ${row.relname}: ${row.n_live_tup}`);
  
  // 표본 SELECT — 각 테이블 LIMIT 3
  console.log("\n=== AnnouncementChgHst 표본 3건 ===");
  const r2 = await pool.query(`SELECT "annId", "chgItemNm", LEFT("bfChgVal",30) AS bf, LEFT("afChgVal",30) AS af FROM "AnnouncementChgHst" LIMIT 3`);
  for (const row of r2.rows) console.log(`  ${row.annId?.substring(0,30)} | ${row.chgItemNm} | ${row.bf} → ${row.af}`);
  
  console.log("\n=== PreStdrd 표본 3건 ===");
  const r3 = await pool.query(`SELECT * FROM "PreStdrd" LIMIT 3`);
  for (const row of r3.rows) console.log(`  ${JSON.stringify(row).substring(0,150)}`);
  
  console.log("\n=== BidOpeningDetail 표본 3건 ===");
  const r4 = await pool.query(`SELECT "annId", "selPrdprcIdx", "bidCount", "openingDate" FROM "BidOpeningDetail" LIMIT 3`);
  for (const row of r4.rows) console.log(`  ${row.annId?.substring(0,30)} | sel=${JSON.stringify(row.selPrdprcIdx)} | bidCount=${row.bidCount} | open=${row.openingDate}`);
  
  console.log("\n=== BidResult 표본 3건 ===");
  const r5 = await pool.query(`SELECT "konepsId", "winnerName", "finalPrice", "bidRate" FROM "BidResult" LIMIT 3`);
  for (const row of r5.rows) console.log(`  ${row.konepsId} | ${row.winnerName?.substring(0,30)} | ${row.finalPrice} | rate=${row.bidRate}`);
  
  console.log("\n=== 91 재수집 ym 표본 (200201, 200703, 201401, 202103, 202602) ===");
  for (const ym of ["2002-01", "2007-03", "2014-01", "2021-03", "2026-02"]) {
    const [y, m] = ym.split("-");
    const start = `${y}-${m}-01`;
    const next = m === "12" ? `${parseInt(y)+1}-01-01` : `${y}-${String(parseInt(m)+1).padStart(2,"0")}-01`;
    const q = await pool.query(`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE "bsisAmt"::text != '0')::int AS bsis,
        COUNT(*) FILTER (WHERE array_length("subCategories",1) > 0)::int AS sub
      FROM "Announcement" WHERE deadline >= $1::timestamptz AND deadline < $2::timestamptz
    `, [start, next]);
    const { total, bsis, sub } = q.rows[0];
    if (total > 0) console.log(`  ${ym}: total=${total} | bsis=${(bsis*100/total).toFixed(1)}% | sub=${(sub*100/total).toFixed(1)}%`);
    else console.log(`  ${ym}: total=0`);
  }
  
  await pool.end();
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
