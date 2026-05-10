import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    const r = await p.query(`SELECT (SUM(avg * "sampleSize") / NULLIF(SUM("sampleSize"),0))::numeric(10,4) AS wavg, SUM("sampleSize")::bigint AS total, COUNT(*)::int AS rows FROM "SajungRateStat" WHERE category='토목공사'`);
    console.log("토목공사 전체 가중평균:", r.rows[0]);
    const r2 = await p.query(`SELECT DISTINCT "orgName" FROM "SajungRateStat" WHERE category='토목공사' LIMIT 5`);
    console.log("orgName 샘플:", r2.rows);
  } finally { await p.end(); }
})().catch(e => { console.error(e); process.exit(1); });
