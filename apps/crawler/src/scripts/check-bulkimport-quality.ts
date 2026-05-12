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
  console.log("=== 5워커 bulk-import 품질 검증 ===\n");

  console.log("1. 가장 최근 INSERT 된 공고 (createdAt 기준 상위 10건)");
  const r1 = await pool.query(`
    SELECT "konepsId", "deadline"::date AS dl, "createdAt"::timestamp(0) AS ca,
           "ciblAplYn" AS cibl, "mtltyAdvcPsblYn" AS mtl,
           "bidNtceDtlUrl" != '' AS url_ok,
           "ntceInsttOfclTelNo" != '' AS tel_ok
    FROM "Announcement"
    WHERE "createdAt" > NOW() - INTERVAL '20 minutes'
    ORDER BY "createdAt" DESC LIMIT 10
  `);
  for (const row of r1.rows) {
    console.log(`  ${row.konepsid} | dl=${row.dl} | ca=${row.ca.toISOString().slice(11,19)} | cibl='${row.cibl}' | mtl='${row.mtl}' | url=${row.url_ok} | tel=${row.tel_ok}`);
  }

  console.log("\n2. 최근 20분 INSERT/UPDATE 공고의 ciblAplYn 채움률");
  const r2 = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE "ciblAplYn" != '')::int AS cibl_filled,
      COUNT(*) FILTER (WHERE "mtltyAdvcPsblYn" != '')::int AS mtl_filled,
      COUNT(*) FILTER (WHERE "bidNtceDtlUrl" != '')::int AS url_filled,
      COUNT(*) FILTER (WHERE "ntceInsttOfclTelNo" != '')::int AS tel_filled,
      COUNT(*) FILTER (WHERE "sucsfbidLwltRate" > 0)::int AS rate_filled
    FROM "Announcement"
    WHERE "createdAt" > NOW() - INTERVAL '20 minutes'
       OR "updatedAt" > NOW() - INTERVAL '20 minutes'
  `);
  const r = r2.rows[0];
  if (r.total === 0) {
    console.log("  최근 20분 변경된 공고 없음");
  } else {
    const pct = (n: number) => `${((n / r.total) * 100).toFixed(1)}%`;
    console.log(`  total=${r.total}`);
    console.log(`  ciblAplYn:           ${r.cibl_filled} (${pct(r.cibl_filled)})`);
    console.log(`  mtltyAdvcPsblYn:     ${r.mtl_filled} (${pct(r.mtl_filled)})`);
    console.log(`  bidNtceDtlUrl:       ${r.url_filled} (${pct(r.url_filled)})`);
    console.log(`  ntceInsttOfclTelNo:  ${r.tel_filled} (${pct(r.tel_filled)})`);
    console.log(`  sucsfbidLwltRate>0:  ${r.rate_filled} (${pct(r.rate_filled)})`);
  }

  console.log("\n3. ciblAplYn 값 분포 (최근 20분)");
  const r3 = await pool.query(`
    SELECT "ciblAplYn" AS v, COUNT(*)::int AS cnt
    FROM "Announcement"
    WHERE ("createdAt" > NOW() - INTERVAL '20 minutes' OR "updatedAt" > NOW() - INTERVAL '20 minutes')
    GROUP BY 1 ORDER BY 2 DESC LIMIT 5
  `);
  for (const row of r3.rows) {
    console.log(`  '${row.v}': ${Number(row.cnt).toLocaleString()}`);
  }

  console.log("\n4. rawJson 안에 ciblAplYn 키 자체가 들어왔는지 표본");
  const r4 = await pool.query(`
    SELECT "konepsId",
           "rawJson" ? 'ciblAplYn' AS has_cibl,
           "rawJson" ? 'mtltyAdvcPsblYn' AS has_mtl,
           "rawJson"->>'ciblAplYn' AS cibl_val
    FROM "Announcement"
    WHERE "createdAt" > NOW() - INTERVAL '20 minutes'
    ORDER BY "createdAt" DESC LIMIT 5
  `);
  for (const row of r4.rows) {
    console.log(`  ${row.konepsid} | has_cibl=${row.has_cibl} | has_mtl=${row.has_mtl} | cibl_val='${row.cibl_val ?? "(없음)"}'`);
  }

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
