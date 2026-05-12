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
  const r = await pool.query(`
    SELECT
      COUNT(*)::int AS total_active_cnstwk,
      COUNT(*) FILTER (WHERE
        "aValueYn" = '' OR "aValueYn" IS NULL OR
        "priceRangeRate" = '' OR "priceRangeRate" IS NULL OR
        ("aValueYn" = 'Y' AND ("aValueTotal" = 0 OR "aValueTotal" IS NULL))
      )::int AS list_target
    FROM "Announcement"
    WHERE "deadline" >= NOW()
      AND ("category" LIKE '%공사%' OR "category" = '시설공사')
  `);
  const row = r.rows[0];
  console.log(`진행중 공사 공고: ${row.total_active_cnstwk.toLocaleString()}건`);
  console.log(`fill-avalue 처리 대상 (list): ${row.list_target.toLocaleString()}건`);
  console.log(`per-ann UPDATE × 50ms 추정: ${(row.list_target * 50 / 1000 / 60).toFixed(1)}분`);
  console.log(`per-ann UPDATE × 30ms 추정: ${(row.list_target * 30 / 1000 / 60).toFixed(1)}분`);
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
