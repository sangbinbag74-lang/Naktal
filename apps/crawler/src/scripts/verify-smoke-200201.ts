import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env: Record<string, string> = {};
const candidates = [path.resolve(__dirname, "../../../../.env"), path.resolve(__dirname, "../../.env")];
for (const p of candidates) {
  if (!fs.existsSync(p)) continue;
  for (const l of fs.readFileSync(p, "utf-8").split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !env[k]) env[k] = v;
  }
}
const dbUrl = env.DATABASE_URL || process.env.DATABASE_URL || "";
const pool = new Pool({ connectionString: dbUrl, max: 1 });

(async () => {
  const r = await pool.query(`
    SELECT "annId", jsonb_array_length("prdprcList") AS n_prd, COALESCE(array_length("selPrdprcIdx",1),0) AS n_sel
    FROM "BidOpeningDetail"
    WHERE "annId" LIKE '200201%'
    ORDER BY "annId" LIMIT 5
  `);
  console.log("=== 표본 5건 ===");
  for (const row of r.rows) console.log(row);
  const cnt = await pool.query(`
    SELECT COUNT(*) FILTER (WHERE COALESCE(array_length("selPrdprcIdx",1),0)>0) AS sel_filled,
           COUNT(*) FILTER (WHERE jsonb_array_length("prdprcList")>0) AS prd_filled,
           COUNT(*) AS total
    FROM "BidOpeningDetail" WHERE "annId" LIKE '200201%'
  `);
  console.log("=== 200201 채움 ===", cnt.rows[0]);
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
