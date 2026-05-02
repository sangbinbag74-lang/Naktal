/**
 * 방금 처리된 EMPTY 구간 (2012~2013, 2015~2018, 2019~2020) 랜덤 20개
 * 진짜 selPrdprcIdx, sucsfbidRate 채워졌는지 확인
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";
function loadDbUrl(): string {
  const c = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
  for (const l of c.split("\n")) {
    const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i < 0) continue;
    if (t.slice(0, i).trim() === "DATABASE_URL") return t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return process.env.DATABASE_URL!;
}

(async () => {
  const pool = new Pool({ connectionString: loadDbUrl(), statement_timeout: 60000 });

  process.stdout.write("=== EMPTY 였던 구간에서 랜덤 20개 (방금 처리된 데이터) ===\n\n");

  // 2012-2013 (E1 완료 직후)
  process.stdout.write("--- 2012~2013 (E1 완료) ---\n");
  const r1 = await pool.query(`
    SELECT "annId", "selPrdprcIdx", "sucsfbidRate", to_char("openingDate", 'YYYY-MM-DD') AS dt
    FROM "BidOpeningDetail"
    WHERE "openingDate" >= '2012-02-01' AND "openingDate" < '2014-01-01'
      AND array_length("selPrdprcIdx", 1) >= 4
    ORDER BY random() LIMIT 7
  `);
  for (const r of r1.rows) process.stdout.write(`  ${r.dt} ${r.annId}: idx=${JSON.stringify(r.selPrdprcIdx)} rate=${r.sucsfbidRate}\n`);

  // 2015-2018 (E2 진행 중)
  process.stdout.write("\n--- 2015~2018 (E2 진행 중) ---\n");
  const r2 = await pool.query(`
    SELECT "annId", "selPrdprcIdx", "sucsfbidRate", to_char("openingDate", 'YYYY-MM-DD') AS dt
    FROM "BidOpeningDetail"
    WHERE "openingDate" >= '2015-05-01' AND "openingDate" < '2018-03-01'
      AND array_length("selPrdprcIdx", 1) >= 4
    ORDER BY random() LIMIT 7
  `);
  for (const r of r2.rows) process.stdout.write(`  ${r.dt} ${r.annId}: idx=${JSON.stringify(r.selPrdprcIdx)} rate=${r.sucsfbidRate}\n`);

  // 2019-2020 (E3 완료)
  process.stdout.write("\n--- 2019~2020 (E3 완료) ---\n");
  const r3 = await pool.query(`
    SELECT "annId", "selPrdprcIdx", "sucsfbidRate", to_char("openingDate", 'YYYY-MM-DD') AS dt
    FROM "BidOpeningDetail"
    WHERE "openingDate" >= '2019-05-01' AND "openingDate" < '2021-01-01'
      AND array_length("selPrdprcIdx", 1) >= 4
    ORDER BY random() LIMIT 6
  `);
  for (const r of r3.rows) process.stdout.write(`  ${r.dt} ${r.annId}: idx=${JSON.stringify(r.selPrdprcIdx)} rate=${r.sucsfbidRate}\n`);

  process.stdout.write("\n=== 채움율 ===\n");
  const sum = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE "openingDate" >= '2012-02-01' AND "openingDate" < '2014-01-01' AND array_length("selPrdprcIdx",1)>=4)::bigint AS f12,
      COUNT(*) FILTER (WHERE "openingDate" >= '2012-02-01' AND "openingDate" < '2014-01-01')::bigint AS t12,
      COUNT(*) FILTER (WHERE "openingDate" >= '2015-05-01' AND "openingDate" < '2018-03-01' AND array_length("selPrdprcIdx",1)>=4)::bigint AS f15,
      COUNT(*) FILTER (WHERE "openingDate" >= '2015-05-01' AND "openingDate" < '2018-03-01')::bigint AS t15,
      COUNT(*) FILTER (WHERE "openingDate" >= '2019-05-01' AND "openingDate" < '2021-01-01' AND array_length("selPrdprcIdx",1)>=4)::bigint AS f19,
      COUNT(*) FILTER (WHERE "openingDate" >= '2019-05-01' AND "openingDate" < '2021-01-01')::bigint AS t19
    FROM "BidOpeningDetail"
  `);
  const r = sum.rows[0] as Record<string, string>;
  process.stdout.write(`2012-13: ${r.f12}/${r.t12} (${(Number(r.f12)/Number(r.t12)*100).toFixed(1)}%)\n`);
  process.stdout.write(`2015-18: ${r.f15}/${r.t15} (${(Number(r.f15)/Number(r.t15)*100).toFixed(1)}%)\n`);
  process.stdout.write(`2019-20: ${r.f19}/${r.t19} (${(Number(r.f19)/Number(r.t19)*100).toFixed(1)}%)\n`);

  await pool.end();
})();
