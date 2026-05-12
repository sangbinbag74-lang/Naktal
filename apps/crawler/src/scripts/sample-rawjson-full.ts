import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") dbUrl = v;
}
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 0 });

(async () => {
  // 2010-06 시설공사 첫 행 — 모든 키 출력
  const r = await pool.query(`
    SELECT "rawJson"
    FROM "Announcement"
    WHERE "category" = '시설공사' AND "deadline" >= '2010-06-01'::date AND "deadline" < '2010-07-01'::date
      AND "rawJson" IS NOT NULL
    LIMIT 1
  `);
  if (r.rows.length === 0) { console.log("no row"); return; }
  const raw = r.rows[0].rawJson;
  console.log("=== 2010-06 시설공사 rawJson 전체 키 ===");
  const keys = Object.keys(raw).sort();
  for (const k of keys) {
    const v = raw[k];
    const display = v === null ? "null" : (typeof v === "string" ? `"${v}"` : JSON.stringify(v));
    console.log(`  ${k}: ${display.slice(0, 80)}`);
  }
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
