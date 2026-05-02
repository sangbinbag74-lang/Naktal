import { Pool } from "pg";
import * as fs from "fs"; import * as path from "path";
function loadDb() {
  const env = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(env, "utf-8");
  for (const l of c.split("\n")) { const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i === -1) continue;
    const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "DATABASE_URL" && v) return v; } throw new Error("no DATABASE_URL");
}
(async () => {
  const pool = new Pool({ connectionString: loadDb(), max: 1 });
  const c = await pool.connect();
  console.log("=".repeat(70));
  console.log("BidResult.openedAt 검증");
  console.log("=".repeat(70));
  const r = await c.query(`SELECT COUNT(*)::bigint AS total, COUNT("openedAt")::bigint AS filled FROM "BidResult"`);
  const t = Number(r.rows[0].total), f = Number(r.rows[0].filled);
  console.log(`총행수: ${t.toLocaleString()}`);
  console.log(`openedAt 채움: ${f.toLocaleString()} (${(f/t*100).toFixed(2)}%)`);
  console.log(`openedAt 결측: ${(t-f).toLocaleString()} (${((t-f)/t*100).toFixed(2)}%)`);
  console.log("\n--- 표본 10건 (실제 값) ---");
  const sample = await c.query(`SELECT "annId","openedAt","bidRate"::text,"finalPrice"::text,"winnerName" FROM "BidResult" WHERE "openedAt" IS NOT NULL ORDER BY random() LIMIT 10`);
  for (const rr of sample.rows) console.log(`  ${rr.annId} | ${rr.openedAt?.toISOString?.() ?? rr.openedAt} | rate=${rr.bidRate}% | ${rr.winnerName ?? '-'}`);
  console.log("\n--- 결측 5건 (rawJson opengDt 존재 여부) ---");
  const miss = await c.query(`SELECT br."annId", a."rawJson"->>'opengDt' AS opeg, (a."konepsId" IS NULL) AS no_match FROM "BidResult" br LEFT JOIN "Announcement" a ON a."konepsId"=br."annId" WHERE br."openedAt" IS NULL LIMIT 5`);
  for (const rr of miss.rows) console.log(`  ${rr.annId} | opengDt=${rr.opeg ?? '(NULL)'} | no_announcement=${rr.no_match}`);
  console.log("\n--- 연도별 채움 분포 ---");
  const yr = await c.query(`SELECT EXTRACT(YEAR FROM "openedAt")::int AS y, COUNT(*)::bigint AS n FROM "BidResult" WHERE "openedAt" IS NOT NULL GROUP BY 1 ORDER BY 1 DESC LIMIT 8`);
  for (const rr of yr.rows) console.log(`  ${rr.y}: ${Number(rr.n).toLocaleString()}`);
  c.release(); await pool.end();
})().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
