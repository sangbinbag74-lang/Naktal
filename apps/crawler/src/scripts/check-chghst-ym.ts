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
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 30000 });

(async () => {
  const r = await pool.query(`
    SELECT TO_CHAR("chgDate", 'YYYY-MM') AS ym, COUNT(*)::int AS cnt
    FROM "AnnouncementChgHst"
    WHERE "createdAt" > NOW() - INTERVAL '15 minutes'
      AND "chgDate" IS NOT NULL
    GROUP BY 1 ORDER BY 1 DESC LIMIT 30
  `);
  console.log("=== 최근 15분 ChgHst INSERT 의 chgDate ym (어디 처리 중?) ===");
  for (const row of r.rows) {
    console.log(`  ${row.ym}: +${row.cnt}`);
  }
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
