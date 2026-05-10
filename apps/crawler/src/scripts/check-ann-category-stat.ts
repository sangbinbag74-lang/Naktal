import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    const a = await p.query(`SELECT category, "orgName", region, deadline FROM "Announcement" WHERE title ILIKE '%소천면 농업인 생활체육공원%' LIMIT 3`);
    console.log("=== Announcement ===");
    for (const r of a.rows) console.log(" ", r);
    if (!a.rows[0]) return;
    const cat = a.rows[0].category;

    console.log(`\n=== SajungRateStat WHERE orgName='ALL' AND category='${cat}' ===`);
    const r = await p.query(`SELECT "budgetRange", region, "sampleSize", avg FROM "SajungRateStat" WHERE "orgName"='ALL' AND "category"=$1 ORDER BY "sampleSize" DESC LIMIT 30`, [cat]);
    console.log("rows:", r.rowCount);
    for (const row of r.rows) console.log(" ", row.budgetRange, "|", JSON.stringify(row.region), "|", row.sampleSize, "|", row.avg);

    console.log(`\n=== SajungRateStat distinct region for category='${cat}' ===`);
    const r2 = await p.query(`SELECT DISTINCT region, COUNT(*) FROM "SajungRateStat" WHERE "orgName"='ALL' AND "category"=$1 GROUP BY region`, [cat]);
    for (const row of r2.rows) console.log(" ", JSON.stringify(row.region), "->", row.count);

    console.log(`\n=== 전체 ALL rows (category 무관) total ===`);
    const r3 = await p.query(`SELECT "category", COUNT(*) AS rows, SUM("sampleSize")::bigint AS total FROM "SajungRateStat" WHERE "orgName"='ALL' GROUP BY "category" ORDER BY total DESC LIMIT 20`);
    for (const row of r3.rows) console.log(" ", row.category, "|", row.rows, "rows |", row.total, "samples");
  } finally { await p.end(); }
})().catch(e => { console.error(e); process.exit(1); });
