import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

const rootEnv = path.resolve(__dirname, "../../../../.env");
const c = fs.readFileSync(rootEnv, "utf-8");
let url = "";
for (const l of c.split("\n")) {
  const t = l.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") url = v;
}

(async () => {
  const pool = new Pool({ connectionString: url });
  const r1 = await pool.query<{ max_created: string; max_deadline: string }>(`
    SELECT
      MAX("createdAt")::text  AS max_created,
      MAX("deadline")::text   AS max_deadline
    FROM "Announcement"
  `);
  const r2 = await pool.query<{ d: string; cnt: string }>(`
    SELECT TO_CHAR("createdAt"::date, 'YYYY-MM-DD') AS d, COUNT(*)::text AS cnt
    FROM "Announcement"
    WHERE "createdAt" >= NOW() - INTERVAL '14 days'
    GROUP BY 1 ORDER BY 1 DESC
  `);
  const r3 = await pool.query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM "Announcement"`);

  console.log("=== Announcement 상태 ===");
  console.log("총 행수:", r3.rows[0]?.total);
  console.log("max createdAt :", r1.rows[0]?.max_created);
  console.log("max deadline  :", r1.rows[0]?.max_deadline);
  console.log("\n=== 최근 14일 일별 INSERT 수 ===");
  for (const row of r2.rows) console.log(row.d, row.cnt);

  const r4 = await pool.query<{ d: string; cnt: string }>(`
    SELECT TO_CHAR("createdAt", 'YYYY-MM-DD HH24:MI') AS d, COUNT(*)::text AS cnt
    FROM "CrawlLog"
    WHERE "createdAt" >= NOW() - INTERVAL '5 days'
    GROUP BY 1 ORDER BY 1 DESC LIMIT 30
  `);
  console.log("\n=== CrawlLog 최근 5일 ===");
  for (const row of r4.rows) console.log(row.d, row.cnt);

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
