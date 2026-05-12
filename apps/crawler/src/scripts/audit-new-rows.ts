import { Pool } from "pg";
import * as fs from "fs"; import * as path from "path";
let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) { const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") dbUrl = v; }
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 60000 });
(async () => {
  // 오늘 13:00 이후 신규 적재 (91 W1·W2)
  const r = await pool.query(`
    SELECT COUNT(*)::bigint AS c
    FROM "Announcement"
    WHERE "createdAt" >= '2026-05-09 04:00:00 UTC'
  `);
  console.log(`오늘 (UTC 04:00, KST 13:00) 이후 신규 적재 Announcement: ${r.rows[0].c}`);
  await pool.end();
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
