import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

const rootEnv = path.resolve(__dirname, "../../../../.env");
let url = "";
const c = fs.readFileSync(rootEnv, "utf-8");
for (const l of c.split("\n")) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i === -1) continue;
  const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL" && v && !v.includes("[YOUR-PASSWORD]")) url = v;
}

interface CntRow { total: string; filled: string; empty: string }
interface CatRow { category: string; cnt: string }
interface UpdRow { ym: string; cnt: string; sub_empty: string }

(async () => {
  const pool = new Pool({ connectionString: url });

  const months: { ym: string; start: string; end: string }[] = [
    { ym: "2003-05", start: "2003-05-01", end: "2003-06-01" },
    { ym: "2003-04", start: "2003-04-01", end: "2003-05-01" },
    { ym: "2003-06", start: "2003-06-01", end: "2003-07-01" },
    { ym: "2004-09", start: "2004-09-01", end: "2004-10-01" },
    { ym: "2004-08", start: "2004-08-01", end: "2004-09-01" },
    { ym: "2004-10", start: "2004-10-01", end: "2004-11-01" },
    { ym: "2020-12", start: "2020-12-01", end: "2021-01-01" },
    { ym: "2020-11", start: "2020-11-01", end: "2020-12-01" },
    { ym: "2021-01", start: "2021-01-01", end: "2021-02-01" },
  ];

  console.log("ym       | total   | sub채움 | sub빈   | 빈%   | category 분포");
  console.log("---------|---------|--------|--------|-------|---------------");

  for (const m of months) {
    const r = await pool.query<CntRow>(
      `SELECT COUNT(*)::text AS total,
              SUM(CASE WHEN array_length("subCategories", 1) > 0 THEN 1 ELSE 0 END)::text AS filled,
              SUM(CASE WHEN "subCategories" IS NULL OR array_length("subCategories", 1) IS NULL THEN 1 ELSE 0 END)::text AS empty
       FROM "Announcement"
       WHERE "deadline" >= $1::date AND "deadline" < $2::date`,
      [m.start, m.end]
    );
    const t = parseInt(r.rows[0].total);
    const f = parseInt(r.rows[0].filled);
    const e = parseInt(r.rows[0].empty);
    const pct = t > 0 ? ((e / t) * 100).toFixed(1) : "0.0";

    const cat = await pool.query<CatRow>(
      `SELECT category, COUNT(*)::text AS cnt
       FROM "Announcement"
       WHERE "deadline" >= $1::date AND "deadline" < $2::date
       GROUP BY 1 ORDER BY 2 DESC LIMIT 4`,
      [m.start, m.end]
    );
    const catStr = cat.rows.map((c: CatRow) => `${c.category}=${c.cnt}`).join(", ");

    console.log(
      `${m.ym} | ${String(t).padStart(7)} | ${String(f).padStart(6)} | ${String(e).padStart(6)} | ${pct.padStart(4)}% | ${catStr}`
    );
  }

  console.log("\n=== 오늘 07:00 UTC 이후 updatedAt 변경된 행 (refill 영향) ===");
  const today = await pool.query<UpdRow>(
    `SELECT TO_CHAR("deadline", 'YYYY-MM') AS ym,
            COUNT(*)::text AS cnt,
            SUM(CASE WHEN "subCategories" IS NULL OR array_length("subCategories", 1) IS NULL THEN 1 ELSE 0 END)::text AS sub_empty
     FROM "Announcement"
     WHERE "updatedAt" >= '2026-05-04T07:00:00Z'
     GROUP BY 1 ORDER BY 1`
  );
  console.log("ym       | 변경cnt | sub빈");
  console.log("---------|--------|------");
  for (const r of today.rows) {
    console.log(`${r.ym} | ${String(r.cnt).padStart(6)} | ${String(r.sub_empty).padStart(4)}`);
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
