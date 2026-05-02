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
  console.log("정상 범위 (2000~2030) 연도별:");
  const yr = await c.query(`SELECT EXTRACT(YEAR FROM "openedAt")::int AS y, COUNT(*)::bigint AS n FROM "BidResult" WHERE "openedAt" IS NOT NULL AND EXTRACT(YEAR FROM "openedAt") BETWEEN 2000 AND 2030 GROUP BY 1 ORDER BY 1 DESC`);
  for (const rr of yr.rows) console.log(`  ${rr.y}: ${Number(rr.n).toLocaleString()}`);
  console.log("\n이상치 (연도 < 2000 or > 2030):");
  const out = await c.query(`SELECT EXTRACT(YEAR FROM "openedAt")::int AS y, COUNT(*)::bigint AS n FROM "BidResult" WHERE "openedAt" IS NOT NULL AND (EXTRACT(YEAR FROM "openedAt") < 2000 OR EXTRACT(YEAR FROM "openedAt") > 2030) GROUP BY 1 ORDER BY 2 DESC LIMIT 20`);
  for (const rr of out.rows) console.log(`  ${rr.y}: ${Number(rr.n).toLocaleString()}`);
  console.log("\n이상치 표본 5건 (annId + rawJson.opengDt):");
  const sm = await c.query(`SELECT br."annId", br."openedAt", a."rawJson"->>'opengDt' AS opeg FROM "BidResult" br LEFT JOIN "Announcement" a ON a."konepsId"=br."annId" WHERE br."openedAt" IS NOT NULL AND (EXTRACT(YEAR FROM br."openedAt") < 2000 OR EXTRACT(YEAR FROM br."openedAt") > 2030) LIMIT 5`);
  for (const rr of sm.rows) console.log(`  ${rr.annId} | openedAt=${rr.openedAt?.toISOString?.() ?? rr.openedAt} | rawJson.opengDt="${rr.opeg}"`);
  c.release(); await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
