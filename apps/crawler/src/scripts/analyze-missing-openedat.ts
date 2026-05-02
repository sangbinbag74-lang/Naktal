import { Pool } from "pg";
import * as fs from "fs"; import * as path from "path";
function loadDb() {
  const env = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(env, "utf-8");
  for (const l of c.split("\n")) { const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i === -1) continue;
    const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "DATABASE_URL" && v) return v; } throw new Error();
}
(async () => {
  const pool = new Pool({ connectionString: loadDb(), max: 1 });
  const c = await pool.connect();
  console.log("결측 BidResult.annId 분석");
  console.log("=".repeat(70));

  // annId 패턴별 분류
  const pat = await c.query(`
    SELECT
      CASE
        WHEN "annId" ~ '^[0-9]{4}[0-9]+$' THEN substring("annId", 1, 4)
        WHEN "annId" ~ '^R([0-9]{2})' THEN '20' || substring("annId" from 'R([0-9]{2})')
        ELSE 'OTHER'
      END AS year_prefix,
      COUNT(*)::bigint AS n
    FROM "BidResult"
    WHERE "openedAt" IS NULL
    GROUP BY 1 ORDER BY 1
  `);
  console.log("\nannId prefix별 결측 수:");
  let sum = 0;
  for (const r of pat.rows) {
    console.log(`  ${r.year_prefix}: ${Number(r.n).toLocaleString()}`);
    sum += Number(r.n);
  }
  console.log(`  합계: ${sum.toLocaleString()}`);

  // BidResult.createdAt 기준 월별 분포 (수집 시점)
  const mo = await c.query(`
    SELECT to_char("createdAt", 'YYYY-MM') AS ym, COUNT(*)::bigint AS n
    FROM "BidResult" WHERE "openedAt" IS NULL
    GROUP BY 1 ORDER BY 1 LIMIT 30
  `);
  console.log("\nBidResult.createdAt 월별 결측 수 (수집 시점, 상위 30개월):");
  for (const r of mo.rows) console.log(`  ${r.ym}: ${Number(r.n).toLocaleString()}`);

  // annId 표본 + Announcement 매칭 여부
  const sm = await c.query(`
    SELECT br."annId", br."bidRate"::text AS bidRate, br."winnerName",
           (a."konepsId" IS NOT NULL) AS has_announcement,
           a."rawJson"->>'opengDt' AS rawopeg
    FROM "BidResult" br LEFT JOIN "Announcement" a ON a."konepsId"=br."annId"
    WHERE br."openedAt" IS NULL ORDER BY br."annId" LIMIT 10
  `);
  console.log("\n결측 표본 10건:");
  for (const r of sm.rows) console.log(`  ${r.annId} | ann=${r.has_announcement} | rate=${r.bidrate} | winner=${r.winnerName ?? '-'} | rawJson.opengDt=${r.rawopeg ?? 'NA'}`);

  c.release(); await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
