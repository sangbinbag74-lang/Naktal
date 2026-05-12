import { Pool } from "pg";
import * as fs from "fs"; import * as path from "path";
let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) { const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") dbUrl = v; }
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 8000 });
(async () => {
  const r = await pool.query(`SELECT MAX("createdAt") AS last FROM "AnnouncementChgHst" WHERE "createdAt" > NOW() - INTERVAL '5 minutes'`);
  console.log(`최근 5분 INSERT MAX createdAt: ${r.rows[0]?.last || 'none'}`);
  
  const r2 = await pool.query(`
    SELECT a.deadline FROM "AnnouncementChgHst" h
    JOIN "Announcement" a ON h."annId" = a.id
    WHERE h."createdAt" > NOW() - INTERVAL '5 minutes'
    ORDER BY h."createdAt" DESC LIMIT 1
  `);
  console.log(`최근 INSERT 의 deadline: ${r2.rows[0]?.deadline || 'none'}`);
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
