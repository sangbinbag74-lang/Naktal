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
  console.log("=== 워커 처리 ym 별 ciblAplYn 채움률 (DB 실측) ===\n");

  const ymList = ["200305", "200705", "201703", "200305"];
  for (const ym of ["200305", "200705", "201703", "202101", "202404"]) {
    const r = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE "ciblAplYn" != '')::int AS cibl,
        COUNT(*) FILTER (WHERE "mtltyAdvcPsblYn" != '')::int AS mtl,
        COUNT(*) FILTER (WHERE "bidNtceDtlUrl" != '')::int AS url,
        COUNT(*) FILTER (WHERE "ntceInsttOfclTelNo" != '')::int AS tel,
        COUNT(*) FILTER (WHERE "rawJson" ? 'ciblAplYn')::int AS raw_has_cibl,
        COUNT(*) FILTER (WHERE "rawJson"->>'ciblAplYn' = 'Y' OR "rawJson"->>'ciblAplYn' = 'N')::int AS raw_cibl_yn
      FROM "Announcement"
      WHERE "deadline" >= '${ym.slice(0,4)}-${ym.slice(4,6)}-01'::date
        AND "deadline" < ('${ym.slice(0,4)}-${ym.slice(4,6)}-01'::date + INTERVAL '1 month')
    `);
    const row = r.rows[0];
    if (row.total === 0) {
      console.log(`${ym}: total=0 (해당 ym 공고 없음)`);
      continue;
    }
    const pct = (n: number) => `${((n / row.total) * 100).toFixed(1)}%`;
    console.log(`${ym}: total=${row.total.toLocaleString()}`);
    console.log(`  컬럼 ciblAplYn:        ${row.cibl.toLocaleString()} (${pct(row.cibl)})`);
    console.log(`  컬럼 mtltyAdvcPsblYn:  ${row.mtl.toLocaleString()} (${pct(row.mtl)})`);
    console.log(`  컬럼 bidNtceDtlUrl:    ${row.url.toLocaleString()} (${pct(row.url)})`);
    console.log(`  컬럼 ntceInsttOfclTelNo:${row.tel.toLocaleString()} (${pct(row.tel)})`);
    console.log(`  rawJson에 ciblAplYn 키 존재: ${row.raw_has_cibl.toLocaleString()} (${pct(row.raw_has_cibl)})`);
    console.log(`  rawJson ciblAplYn = Y/N: ${row.raw_cibl_yn.toLocaleString()} (${pct(row.raw_cibl_yn)})`);
    console.log("");
  }

  console.log("=== 표본: 200305 공고 5건 (rawJson 에 ciblAplYn 키 유무 + 값) ===");
  const r5 = await pool.query(`
    SELECT "konepsId",
           "rawJson" ? 'ciblAplYn' AS has_key,
           "rawJson"->>'ciblAplYn' AS val,
           "ciblAplYn" AS col,
           length("rawJson"::text) AS rawlen
    FROM "Announcement"
    WHERE "deadline" >= '2003-05-01'::date AND "deadline" < '2003-06-01'::date
    ORDER BY "konepsId" LIMIT 5
  `);
  for (const r of r5.rows) {
    console.log(`  ${r.konepsid} | has_key=${r.has_key} | rawJson val='${r.val ?? "(null)"}' | col='${r.col}' | rawlen=${r.rawlen}`);
  }

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
