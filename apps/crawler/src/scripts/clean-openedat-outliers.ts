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
  console.log("이상치 (연도 < 2000 or > 2030) NULL 처리...");
  const r = await c.query(`UPDATE "BidResult" SET "openedAt" = NULL WHERE "openedAt" IS NOT NULL AND (EXTRACT(YEAR FROM "openedAt") < 2000 OR EXTRACT(YEAR FROM "openedAt") > 2030)`);
  console.log(`  ${r.rowCount} 행 NULL 처리 완료`);

  const v = await c.query(`SELECT COUNT(*)::bigint AS total, COUNT("openedAt")::bigint AS filled FROM "BidResult"`);
  const t = Number(v.rows[0].total), f = Number(v.rows[0].filled);
  console.log(`\n최종: ${f.toLocaleString()} / ${t.toLocaleString()} = ${(f/t*100).toFixed(2)}%`);
  c.release(); await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
