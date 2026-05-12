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
  console.log("=== Announcement 컬럼 채움률 (전체) ===");
  const r1 = await pool.query(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "ciblAplYn" != '')::bigint AS cibl,
      COUNT(*) FILTER (WHERE "mtltyAdvcPsblYn" != '')::bigint AS mtl,
      COUNT(*) FILTER (WHERE "bidNtceDtlUrl" != '')::bigint AS url,
      COUNT(*) FILTER (WHERE "ntceInsttOfclTelNo" != '')::bigint AS tel,
      COUNT(*) FILTER (WHERE "sucsfbidLwltRate" > 0)::bigint AS rate,
      COUNT(*) FILTER (WHERE array_length("subCategories", 1) > 0)::bigint AS subcat,
      COUNT(*) FILTER (WHERE "aValueYn" = 'Y')::bigint AS avalueY,
      COUNT(*) FILTER (WHERE "aValueAmt" > 0)::bigint AS avalueAmt,
      COUNT(*) FILTER (WHERE "aValueTotal" > 0)::bigint AS avalueTotal,
      COUNT(*) FILTER (WHERE "bsisAmt" > 0)::bigint AS bsisAmt,
      COUNT(*) FILTER (WHERE "priceRangeRate" != '')::bigint AS prRate,
      COUNT(*) FILTER (WHERE "rsrvtnPrceRngBgnRate" != 0 OR "rsrvtnPrceRngEndRate" != 0)::bigint AS rsrvtn
    FROM "Announcement"
  `);
  const row = r1.rows[0];
  const total = Number(row.total);
  const fmt = (n: bigint | string, label: string, cond: string) => {
    const v = Number(n);
    return `  ${label.padEnd(22)} ${v.toLocaleString().padStart(10)} (${((v / total) * 100).toFixed(2)}%) ${cond}`;
  };
  console.log(`  total=${total.toLocaleString()}`);
  console.log(fmt(row.cibl,        "ciblAplYn",        "!= ''"));
  console.log(fmt(row.mtl,         "mtltyAdvcPsblYn",  "!= ''"));
  console.log(fmt(row.url,         "bidNtceDtlUrl",    "!= ''"));
  console.log(fmt(row.tel,         "ntceInsttOfclTelNo", "!= ''"));
  console.log(fmt(row.rate,        "sucsfbidLwltRate", "> 0"));
  console.log(fmt(row.subcat,      "subCategories",    "len > 0"));
  console.log(fmt(row.avalueY,     "aValueYn",         "= 'Y'"));
  console.log(fmt(row.avalueAmt,   "aValueAmt",        "> 0"));
  console.log(fmt(row.avalueTotal, "aValueTotal",      "> 0"));
  console.log(fmt(row.bsisAmt,     "bsisAmt",          "> 0"));
  console.log(fmt(row.prRate,      "priceRangeRate",   "!= ''"));
  console.log(fmt(row.rsrvtn,      "rsrvtnPrceRng",    "bgn or end != 0"));

  console.log("\n=== Cnstwk 한정 (시설공사 = G2B 사양상 채움 가능 영역) ===");
  const r2 = await pool.query(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "ciblAplYn" != '')::bigint AS cibl,
      COUNT(*) FILTER (WHERE "aValueYn" = 'Y')::bigint AS avalueY,
      COUNT(*) FILTER (WHERE "aValueTotal" > 0)::bigint AS avalueTotal,
      COUNT(*) FILTER (WHERE "bsisAmt" > 0)::bigint AS bsisAmt,
      COUNT(*) FILTER (WHERE array_length("subCategories", 1) > 0)::bigint AS subcat
    FROM "Announcement"
    WHERE "category" LIKE '%공사%' OR "category" = '시설공사'
  `);
  const r2t = Number(r2.rows[0].total);
  const fmt2 = (n: bigint | string, label: string) => {
    const v = Number(n);
    return `  ${label.padEnd(22)} ${v.toLocaleString().padStart(10)} (${((v / r2t) * 100).toFixed(2)}%)`;
  };
  console.log(`  Cnstwk total=${r2t.toLocaleString()}`);
  console.log(fmt2(r2.rows[0].cibl, "ciblAplYn"));
  console.log(fmt2(r2.rows[0].avalueY, "aValueYn = 'Y'"));
  console.log(fmt2(r2.rows[0].avalueTotal, "aValueTotal > 0"));
  console.log(fmt2(r2.rows[0].bsisAmt, "bsisAmt > 0"));
  console.log(fmt2(r2.rows[0].subcat, "subCategories"));

  console.log("\n=== BidOpeningDetail (selPrdprcIdx) ===");
  const r3 = await pool.query(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE array_length("selPrdprcIdx", 1) > 0)::bigint AS sel_filled,
      COUNT(*) FILTER (WHERE "prdprcList" IS NOT NULL AND jsonb_array_length("prdprcList") > 0)::bigint AS prdlist_filled
    FROM "BidOpeningDetail"
  `);
  const r3t = Number(r3.rows[0].total);
  console.log(`  total=${r3t.toLocaleString()}`);
  console.log(`  selPrdprcIdx > 0:    ${Number(r3.rows[0].sel_filled).toLocaleString()} (${((Number(r3.rows[0].sel_filled) / r3t) * 100).toFixed(2)}%)`);
  console.log(`  prdprcList > 0:      ${Number(r3.rows[0].prdlist_filled).toLocaleString()} (${((Number(r3.rows[0].prdlist_filled) / r3t) * 100).toFixed(2)}%)`);

  console.log("\n=== AnnouncementChgHst ===");
  const r4 = await pool.query(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "chgItemNm" != '')::bigint AS chgItem,
      COUNT(*) FILTER (WHERE "bfChgVal" != '' OR "afChgVal" != '')::bigint AS chgVal
    FROM "AnnouncementChgHst"
  `);
  const r4t = Number(r4.rows[0].total);
  console.log(`  total=${r4t.toLocaleString()}`);
  console.log(`  chgItemNm:           ${Number(r4.rows[0].chgItem).toLocaleString()} (${((Number(r4.rows[0].chgItem) / r4t) * 100).toFixed(2)}%)`);
  console.log(`  bfChgVal or afChgVal: ${Number(r4.rows[0].chgVal).toLocaleString()} (${((Number(r4.rows[0].chgVal) / r4t) * 100).toFixed(2)}%)`);

  console.log("\n=== aValueTotal 연도별 (2018~) ===");
  const r5 = await pool.query(`
    SELECT
      EXTRACT(YEAR FROM "deadline")::int AS yr,
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "aValueTotal" > 0)::bigint AS filled
    FROM "Announcement"
    WHERE "deadline" >= '2018-01-01'::date AND "deadline" < '2027-01-01'::date
      AND ("category" LIKE '%공사%' OR "category" = '시설공사')
    GROUP BY 1 ORDER BY 1
  `);
  for (const r of r5.rows) {
    const t = Number(r.total), f = Number(r.filled);
    console.log(`  ${r.yr}: cnstwk_total=${t.toLocaleString().padStart(8)} filled=${f.toLocaleString().padStart(7)} (${((f / t) * 100).toFixed(1)}%)`);
  }

  console.log("\n=== subCategories 연도별 (2018~) ===");
  const r6 = await pool.query(`
    SELECT
      EXTRACT(YEAR FROM "deadline")::int AS yr,
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE array_length("subCategories", 1) > 0)::bigint AS filled
    FROM "Announcement"
    WHERE "deadline" >= '2018-01-01'::date AND "deadline" < '2027-01-01'::date
      AND ("category" LIKE '%공사%' OR "category" = '시설공사')
    GROUP BY 1 ORDER BY 1
  `);
  for (const r of r6.rows) {
    const t = Number(r.total), f = Number(r.filled);
    console.log(`  ${r.yr}: cnstwk_total=${t.toLocaleString().padStart(8)} filled=${f.toLocaleString().padStart(7)} (${((f / t) * 100).toFixed(1)}%)`);
  }

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
