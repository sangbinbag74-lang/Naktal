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
  console.log("=== Announcement 7개 컬럼 채움률 (전체) ===");
  const r = await pool.query(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "ciblAplYn" != '')::bigint AS cibl,
      COUNT(*) FILTER (WHERE "mtltyAdvcPsblYn" != '')::bigint AS mtl,
      COUNT(*) FILTER (WHERE "bidNtceDtlUrl" != '')::bigint AS url,
      COUNT(*) FILTER (WHERE "ntceInsttOfclTelNo" != '')::bigint AS tel,
      COUNT(*) FILTER (WHERE "sucsfbidLwltRate" > 0)::bigint AS rate,
      COUNT(*) FILTER (WHERE array_length("subCategories", 1) > 0)::bigint AS subcat
    FROM "Announcement"
  `);
  const row = r.rows[0];
  const total = Number(row.total);
  const pct = (n: bigint | string) => `${((Number(n) / total) * 100).toFixed(2)}%`;
  console.log(`  total=${total.toLocaleString()}`);
  console.log(`  ciblAplYn:           ${Number(row.cibl).toLocaleString().padStart(10)} (${pct(row.cibl)})`);
  console.log(`  mtltyAdvcPsblYn:     ${Number(row.mtl).toLocaleString().padStart(10)} (${pct(row.mtl)})`);
  console.log(`  bidNtceDtlUrl:       ${Number(row.url).toLocaleString().padStart(10)} (${pct(row.url)})`);
  console.log(`  ntceInsttOfclTelNo:  ${Number(row.tel).toLocaleString().padStart(10)} (${pct(row.tel)})`);
  console.log(`  sucsfbidLwltRate>0:  ${Number(row.rate).toLocaleString().padStart(10)} (${pct(row.rate)})`);
  console.log(`  subCategories>0:     ${Number(row.subcat).toLocaleString().padStart(10)} (${pct(row.subcat)})`);

  console.log("\n=== Cnstwk(시설공사) 한정 ciblAplYn 채움률 (G2B 응답 한정) ===");
  const r2 = await pool.query(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "ciblAplYn" != '')::bigint AS cibl
    FROM "Announcement"
    WHERE "category" LIKE '%공사%' OR "category" = '시설공사'
  `);
  const r2t = Number(r2.rows[0].total);
  const r2c = Number(r2.rows[0].cibl);
  console.log(`  Cnstwk total=${r2t.toLocaleString()} / cibl_filled=${r2c.toLocaleString()} (${((r2c / r2t) * 100).toFixed(2)}%)`);

  console.log("\n=== 표본: 최근 INSERT 5건 ===");
  const r3 = await pool.query(`
    SELECT "konepsId", "deadline"::date,
           "ciblAplYn" AS cibl, "mtltyAdvcPsblYn" AS mtl,
           length("bidNtceDtlUrl") > 0 AS url_ok,
           "sucsfbidLwltRate" AS rate
    FROM "Announcement"
    ORDER BY "createdAt" DESC LIMIT 5
  `);
  for (const row of r3.rows) {
    console.log(`  ${row.konepsId} dl=${row.deadline} cibl='${row.cibl}' mtl='${row.mtl}' url=${row.url_ok} rate=${row.rate}`);
  }

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
