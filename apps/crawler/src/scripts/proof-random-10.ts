/**
 * 랜덤 10개 표본 — 6개 테이블 실제 값 확인
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadDbUrl(): string {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(rootEnv, "utf-8");
  for (const l of c.split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "DATABASE_URL" && v) return v;
  }
  return process.env.DATABASE_URL!;
}

(async () => {
  const pool = new Pool({ connectionString: loadDbUrl(), statement_timeout: 60000 });

  const sec = (label: string) => process.stdout.write(`\n${"=".repeat(70)}\n## ${label}\n${"=".repeat(70)}\n`);
  const log = (rows: unknown[]) => {
    for (const r of rows as Record<string, unknown>[]) process.stdout.write(JSON.stringify(r).slice(0, 250) + "\n");
  };

  sec("1. Announcement (subCategories/bsisAmt/aValueTotal/ciblAplYn/lwltRate)");
  log((await pool.query(`
    SELECT "konepsId", LEFT(title, 30) AS title, "subCategories", "bsisAmt", "aValueTotal", "ciblAplYn", "sucsfbidLwltRate"
    FROM "Announcement" TABLESAMPLE BERNOULLI (0.05)
    WHERE array_length("subCategories", 1) > 0 LIMIT 10
  `)).rows);

  sec("2. PreStdrd (bfSpecRgstNm 사전규격명, ntceInsttNm 기관명)");
  log((await pool.query(`
    SELECT "bfSpecRgstNo", LEFT("bfSpecRgstNm", 35) AS nm, LEFT("ntceInsttNm", 25) AS inst
    FROM "PreStdrd" TABLESAMPLE BERNOULLI (0.1)
    WHERE COALESCE("bfSpecRgstNm",'') != '' LIMIT 10
  `)).rows);

  sec("3. AnnouncementChgHst (변경항목/전후값)");
  log((await pool.query(`
    SELECT "annId", "chgItemNm", LEFT("bfChgVal", 30) AS bf, LEFT("afChgVal", 30) AS af
    FROM "AnnouncementChgHst" TABLESAMPLE BERNOULLI (0.1)
    WHERE "chgItemNm" != '' LIMIT 10
  `)).rows);

  sec("4. BidOpeningDetail (selPrdprcIdx 선택 4개, sucsfbidRate 낙찰률)");
  log((await pool.query(`
    SELECT "annId", "selPrdprcIdx", "sucsfbidRate"
    FROM "BidOpeningDetail" TABLESAMPLE BERNOULLI (0.05)
    WHERE array_length("selPrdprcIdx", 1) >= 4 LIMIT 10
  `)).rows);

  sec("5. BidResult (bidRate, numBidders, winnerName)");
  log((await pool.query(`
    SELECT "annId", "bidRate", "numBidders", LEFT("winnerName", 25) AS winner
    FROM "BidResult" TABLESAMPLE BERNOULLI (0.05)
    WHERE "winnerName" IS NOT NULL AND "numBidders" > 0 LIMIT 10
  `)).rows);

  sec("6. SajungRateStat (사정율 통계)");
  log((await pool.query(`
    SELECT LEFT("orgName", 20) AS org, category, "budgetRange", region, avg, "sampleSize"
    FROM "SajungRateStat" TABLESAMPLE BERNOULLI (1)
    WHERE "sampleSize" >= 10 LIMIT 10
  `)).rows);

  sec("요약 — 채움율");
  const r = (await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM "PreStdrd" WHERE COALESCE("bfSpecRgstNm",'') != '')::bigint AS pre_nm,
      (SELECT reltuples::bigint FROM pg_class WHERE relname='PreStdrd') AS pre_total,
      (SELECT COUNT(*) FROM "AnnouncementChgHst" WHERE "chgItemNm" != '')::bigint AS chg_item,
      (SELECT reltuples::bigint FROM pg_class WHERE relname='AnnouncementChgHst') AS chg_total,
      (SELECT COUNT(*) FROM "BidOpeningDetail" WHERE array_length("selPrdprcIdx",1) >= 4)::bigint AS bod_sel,
      (SELECT COUNT(*) FROM "BidOpeningDetail" WHERE "sucsfbidRate" > 0)::bigint AS bod_rate,
      (SELECT reltuples::bigint FROM pg_class WHERE relname='BidOpeningDetail') AS bod_total
  `)).rows[0] as Record<string, string>;
  const pct = (a: string, b: string) => `${((Number(a)/Number(b))*100).toFixed(1)}%`;
  process.stdout.write(`PreStdrd.bfSpecRgstNm:  ${r.pre_nm}/${r.pre_total} (${pct(r.pre_nm, r.pre_total)})\n`);
  process.stdout.write(`Chg.chgItemNm:         ${r.chg_item}/${r.chg_total} (${pct(r.chg_item, r.chg_total)})\n`);
  process.stdout.write(`BOD.selPrdprcIdx>=4:    ${r.bod_sel}/${r.bod_total} (${pct(r.bod_sel, r.bod_total)})\n`);
  process.stdout.write(`BOD.sucsfbidRate>0:     ${r.bod_rate}/${r.bod_total} (${pct(r.bod_rate, r.bod_total)})\n`);

  await pool.end();
})();
