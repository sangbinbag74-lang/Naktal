import { Pool } from "pg";
import * as fs from "fs"; import * as path from "path";
let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) { const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") dbUrl = v; }
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 120000 });

(async () => {
  const t0 = Date.now();
  
  // 1. Announcement 전체 채움률
  console.log("=== 1. Announcement 전체 채움률 ===");
  const r1 = await pool.query(`
    SELECT COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "bsisAmt"::text != '0')::bigint AS bsis,
      COUNT(*) FILTER (WHERE array_length("subCategories",1) > 0)::bigint AS sub,
      COUNT(*) FILTER (WHERE "ciblAplYn" != '')::bigint AS cibl,
      COUNT(*) FILTER (WHERE "sucsfbidLwltRate" > 0)::bigint AS llrate
    FROM "Announcement"
  `);
  const a = r1.rows[0];
  const t = Number(a.total);
  console.log(`  total: ${a.total}`);
  console.log(`  bsisAmt:           ${a.bsis} (${(Number(a.bsis)*100/t).toFixed(1)}%)`);
  console.log(`  subCategories:     ${a.sub} (${(Number(a.sub)*100/t).toFixed(1)}%)`);
  console.log(`  ciblAplYn:         ${a.cibl} (${(Number(a.cibl)*100/t).toFixed(1)}%)`);
  console.log(`  sucsfbidLwltRate:  ${a.llrate} (${(Number(a.llrate)*100/t).toFixed(1)}%)`);
  
  // 2. 보조 테이블 rowCount
  console.log("\n=== 2. 보조 테이블 rowCount ===");
  for (const tbl of ["AnnouncementChgHst", "PreStdrd", "BidOpeningDetail", "BidResult"]) {
    const r = await pool.query(`SELECT COUNT(*)::bigint AS c FROM "${tbl}"`);
    console.log(`  ${tbl}: ${r.rows[0].c}`);
  }
  
  // 3. 재수집 ym 5건 표본
  console.log("\n=== 3. 재수집 ym 표본 (200201, 200703, 201401, 202103, 202602 — 91 W1·W2 처리) ===");
  for (const ym of ["2002-01", "2007-03", "2014-01", "2021-03", "2026-02"]) {
    const [y, m] = ym.split("-");
    const start = `${y}-${m}-01`;
    const next = m === "12" ? `${parseInt(y)+1}-01-01` : `${y}-${String(parseInt(m)+1).padStart(2,"0")}-01`;
    const r = await pool.query(`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE "bsisAmt"::text != '0')::int AS bsis,
        COUNT(*) FILTER (WHERE array_length("subCategories",1) > 0)::int AS sub
      FROM "Announcement" WHERE deadline >= $1::timestamptz AND deadline < $2::timestamptz
    `, [start, next]);
    const { total, bsis, sub } = r.rows[0];
    if (total > 0) {
      console.log(`  ${ym}: total=${total} | bsis=${(bsis*100/total).toFixed(1)}% | sub=${(sub*100/total).toFixed(1)}%`);
    } else {
      console.log(`  ${ym}: total=0 (재수집 결과 없음)`);
    }
  }
  
  // 4. 표본 SELECT — Announcement (최근 5건)
  console.log("\n=== 4. Announcement 표본 5건 (최근) ===");
  const r4 = await pool.query(`
    SELECT "konepsId", title, "orgName", category, region, deadline, budget, "bsisAmt", "subCategories"
    FROM "Announcement" ORDER BY "createdAt" DESC LIMIT 5
  `);
  for (const r of r4.rows) {
    console.log(`  ${r.konepsId} | ${r.title?.substring(0,40)} | bsisAmt=${r.bsisAmt} | sub=${JSON.stringify(r.subCategories)?.substring(0,40)}`);
  }
  
  // 5. AnnouncementChgHst 표본
  console.log("\n=== 5. AnnouncementChgHst 표본 3건 ===");
  const r5 = await pool.query(`SELECT "annId", "chgItemNm", "bfChgVal", "afChgVal" FROM "AnnouncementChgHst" LIMIT 3`);
  for (const r of r5.rows) {
    console.log(`  annId=${r.annId?.substring(0,30)} | item=${r.chgItemNm} | ${r.bfChgVal?.substring(0,20)} → ${r.afChgVal?.substring(0,20)}`);
  }
  
  console.log(`\n=== audit 완료: ${((Date.now()-t0)/1000).toFixed(1)}초 ===`);
  await pool.end();
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
