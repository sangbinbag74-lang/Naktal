/**
 * 127월 재수집 완료 후 DB 채움률 보고
 *
 * 127월 (run-127months.ts MONTHS_127와 동일) deadline 범위로 한정.
 * 핵심 필드 채움률 + 샘플값 출력.
 *
 * 실행: pnpm exec ts-node src/scripts/report-127months-fillrate.ts
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

(function loadEnv() {
  const candidates = [
    path.resolve(__dirname, "../../../web/.env.local"),
    path.resolve(__dirname, "../../../../.env"),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const c = fs.readFileSync(p, "utf-8");
    for (const l of c.split("\n")) {
      const t = l.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (!k) continue;
      if (v.includes("[YOUR-PASSWORD]") || v.includes("your-project")) continue;
      if (!process.env[k]) process.env[k] = v;
    }
  }
})();

const MONTHS_127 = [
  "200201","200202","200203","200204","200205","200206","200207","200208","200209","200210","200211","200212",
  "200301","200302","200303","200305","200310","200311",
  "200401","200402","200403","200409","200410",
  "200501","200502","200503","200506","200508","200509",
  "200601","200602","200603",
  "200701","200702","200703","200704",
  "200801","200802","200803",
  "200901",
  "201001","201007","201009","201010",
  "201101","201102",
  "201201",
  "201301","201303",
  "201401","201402","201403","201404","201407","201408","201411",
  "201501","201502","201503","201504","201508","201509","201511",
  "201601","201602","201603","201606","201607","201608","201609","201610","201611",
  "201701","201702","201711",
  "201801","201810","201811",
  "201901","201910","201911",
  "202001","202002","202006","202007","202008","202009","202010","202011","202012",
  "202101","202102","202103","202104","202105","202106","202107","202108","202109","202110","202111","202112",
  "202201","202202","202203","202204","202205","202206","202207","202208","202209","202210","202211",
  "202301","202310","202311",
  "202401","202404","202405","202409","202410","202411",
  "202501","202502","202510","202511",
  "202601",
];

function ymRangeSql(): string {
  const ranges = MONTHS_127.map((ym) => {
    const y = parseInt(ym.slice(0, 4), 10);
    const m = parseInt(ym.slice(4, 6), 10);
    const start = `'${y}-${String(m).padStart(2,"0")}-01 00:00:00+09:00'::timestamptz`;
    const next = m === 12 ? `'${y+1}-01-01 00:00:00+09:00'::timestamptz` : `'${y}-${String(m+1).padStart(2,"0")}-01 00:00:00+09:00'::timestamptz`;
    return `("deadline" >= ${start} AND "deadline" < ${next})`;
  }).join(" OR ");
  return `(${ranges})`;
}

(async () => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error("DATABASE_URL 미설정"); process.exit(1); }
  const pool = new Pool({ connectionString: dbUrl, max: 2 });
  const where127 = ymRangeSql();

  console.log(`\n=== 127월 재수집 DB 채움률 보고 ===`);
  console.log(`대상 월: ${MONTHS_127.length}월 (${MONTHS_127[0]} ~ ${MONTHS_127[MONTHS_127.length - 1]})\n`);

  const checks: Array<{ table: string; field: string; totalSql: string; filledSql: string; sampleSql: string }> = [
    { table: "Announcement", field: "subCategories (업종, LicenseLimit 결과)",
      totalSql: `SELECT COUNT(*)::bigint AS n FROM "Announcement" WHERE ${where127}`,
      filledSql: `SELECT COUNT(*)::bigint AS n FROM "Announcement" WHERE ${where127} AND "subCategories" IS NOT NULL AND array_length("subCategories",1) > 0`,
      sampleSql: `SELECT "konepsId", "subCategories" FROM "Announcement" WHERE ${where127} AND array_length("subCategories",1) > 0 LIMIT 3` },
    { table: "Announcement", field: "bsisAmt (기초금액, BsisAmount 결과)",
      totalSql: `SELECT COUNT(*)::bigint AS n FROM "Announcement" WHERE ${where127}`,
      filledSql: `SELECT COUNT(*)::bigint AS n FROM "Announcement" WHERE ${where127} AND "bsisAmt" > 0`,
      sampleSql: `SELECT "konepsId", "bsisAmt"::text FROM "Announcement" WHERE ${where127} AND "bsisAmt" > 0 LIMIT 3` },
    { table: "Announcement", field: "aValueTotal (CalclA 결과)",
      totalSql: `SELECT COUNT(*)::bigint AS n FROM "Announcement" WHERE ${where127}`,
      filledSql: `SELECT COUNT(*)::bigint AS n FROM "Announcement" WHERE ${where127} AND "aValueTotal" > 0`,
      sampleSql: `SELECT "konepsId", "aValueTotal"::text FROM "Announcement" WHERE ${where127} AND "aValueTotal" > 0 LIMIT 3` },
    { table: "Announcement", field: "sucsfbidLwltRate (낙찰하한율, 본체 컬럼 승격)",
      totalSql: `SELECT COUNT(*)::bigint AS n FROM "Announcement" WHERE ${where127}`,
      filledSql: `SELECT COUNT(*)::bigint AS n FROM "Announcement" WHERE ${where127} AND "sucsfbidLwltRate" > 0`,
      sampleSql: `SELECT "konepsId", "sucsfbidLwltRate" FROM "Announcement" WHERE ${where127} AND "sucsfbidLwltRate" > 0 LIMIT 3` },
    { table: "Announcement", field: "bidNtceDtlUrl (상세 URL, 본체 컬럼 승격)",
      totalSql: `SELECT COUNT(*)::bigint AS n FROM "Announcement" WHERE ${where127}`,
      filledSql: `SELECT COUNT(*)::bigint AS n FROM "Announcement" WHERE ${where127} AND "bidNtceDtlUrl" IS NOT NULL AND "bidNtceDtlUrl" != ''`,
      sampleSql: `SELECT "konepsId", LEFT("bidNtceDtlUrl",60) FROM "Announcement" WHERE ${where127} AND "bidNtceDtlUrl" != '' LIMIT 3` },
    { table: "BidResult", field: "annId (낙찰 결과, SCSBID 적재)",
      totalSql: `SELECT COUNT(*)::bigint AS n FROM "BidResult" b JOIN "Announcement" a ON b."annId" = a."konepsId" WHERE ${where127.replace(/"deadline"/g, 'a."deadline"')}`,
      filledSql: `SELECT COUNT(*)::bigint AS n FROM "BidResult" b JOIN "Announcement" a ON b."annId" = a."konepsId" WHERE ${where127.replace(/"deadline"/g, 'a."deadline"')} AND b."finalPrice" > 0`,
      sampleSql: `SELECT b."annId", b."finalPrice"::text, b."winnerName" FROM "BidResult" b JOIN "Announcement" a ON b."annId" = a."konepsId" WHERE ${where127.replace(/"deadline"/g, 'a."deadline"')} AND b."finalPrice" > 0 LIMIT 3` },
    { table: "AnnouncementChgHst", field: "chgItemNm (변경공고, ChgHst 적재)",
      totalSql: `SELECT COUNT(*)::bigint AS n FROM "AnnouncementChgHst" h JOIN "Announcement" a ON h."annId" = a."konepsId" WHERE ${where127.replace(/"deadline"/g, 'a."deadline"')}`,
      filledSql: `SELECT COUNT(*)::bigint AS n FROM "AnnouncementChgHst" h JOIN "Announcement" a ON h."annId" = a."konepsId" WHERE ${where127.replace(/"deadline"/g, 'a."deadline"')} AND h."chgItemNm" IS NOT NULL AND h."chgItemNm" != ''`,
      sampleSql: `SELECT h."annId", h."chgItemNm" FROM "AnnouncementChgHst" h JOIN "Announcement" a ON h."annId" = a."konepsId" WHERE ${where127.replace(/"deadline"/g, 'a."deadline"')} AND h."chgItemNm" != '' LIMIT 3` },
  ];

  console.log(`| 테이블 | 필드 | 전체 | 채움 | 채움률 |`);
  console.log(`|---|---|---|---|---|`);
  for (const c of checks) {
    try {
      const t = await pool.query(c.totalSql);
      const f = await pool.query(c.filledSql);
      const total = Number(t.rows[0].n);
      const filled = Number(f.rows[0].n);
      const pct = total > 0 ? (filled / total * 100).toFixed(2) : "0.00";
      console.log(`| ${c.table} | ${c.field} | ${total.toLocaleString()} | ${filled.toLocaleString()} | ${pct}% |`);
    } catch (e) {
      console.error(`  [${c.table}] ${c.field} — 쿼리 실패: ${(e as Error).message.slice(0, 100)}`);
    }
  }

  console.log(`\n=== 표본 샘플 ===`);
  for (const c of checks) {
    try {
      const r = await pool.query(c.sampleSql);
      console.log(`\n[${c.table}] ${c.field}`);
      for (const row of r.rows) console.log(`  ${JSON.stringify(row)}`);
    } catch (e) { /* 무시 */ }
  }

  await pool.end();
  console.log(`\n=== 보고 완료 ===`);
})().catch((e) => { console.error(e); process.exit(1); });
