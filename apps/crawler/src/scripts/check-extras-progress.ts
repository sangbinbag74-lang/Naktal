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
  console.log("=== AnnouncementChgHst 시간별 INSERT (extras-v2 진행 추적) ===");
  const r1 = await pool.query(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL '3 hours')::bigint AS r3h,
      COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL '1 hour')::bigint AS r1h,
      COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL '10 minutes')::bigint AS r10m
    FROM "AnnouncementChgHst"
  `);
  console.log(`  total=${Number(r1.rows[0].total).toLocaleString()}`);
  console.log(`  최근 3시간: +${Number(r1.rows[0].r3h).toLocaleString()}`);
  console.log(`  최근 1시간: +${Number(r1.rows[0].r1h).toLocaleString()}`);
  console.log(`  최근 10분:  +${Number(r1.rows[0].r10m).toLocaleString()}`);

  console.log("\n=== ChgHst 가장 최근 INSERT 행의 chgDate ym (어디까지 처리?) ===");
  const r2 = await pool.query(`
    SELECT TO_CHAR("chgDate", 'YYYY-MM') AS ym, COUNT(*)::int AS cnt
    FROM "AnnouncementChgHst"
    WHERE "createdAt" > NOW() - INTERVAL '3 hours' AND "chgDate" IS NOT NULL
    GROUP BY 1 ORDER BY 1 DESC LIMIT 10
  `);
  for (const r of r2.rows) {
    console.log(`  ${r.ym}: +${r.cnt.toLocaleString()}`);
  }

  console.log("\n=== Cnstwk 컬럼 채움률 (현재) ===");
  const r3 = await pool.query(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "bsisAmt"::text != '0')::bigint AS bsis,
      COUNT(*) FILTER (WHERE "aValueTotal"::text != '0')::bigint AS atot,
      COUNT(*) FILTER (WHERE array_length("subCategories", 1) > 0)::bigint AS sub
    FROM "Announcement"
    WHERE "category" LIKE '%공사%' OR "category" = '시설공사'
  `);
  const t = Number(r3.rows[0].total);
  const fmt = (n: any, label: string) => {
    const v = Number(n);
    return `  ${label.padEnd(20)} ${v.toLocaleString().padStart(10)} (${((v / t) * 100).toFixed(2)}%)`;
  };
  console.log(`  Cnstwk total=${t.toLocaleString()}`);
  console.log(fmt(r3.rows[0].bsis, "bsisAmt > 0"));
  console.log(fmt(r3.rows[0].atot, "aValueTotal > 0"));
  console.log(fmt(r3.rows[0].sub, "subCategories"));

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
