// P1: 경쟁사 추적 (전 티어, 개수 차등 — 2026-07-09 박상빈님 확정)
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
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 60000 });

(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "CompetitorWatch" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "competitorName" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS "CompetitorWatch_userId_idx" ON "CompetitorWatch"("userId")`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS "CompetitorWatch_user_name_key" ON "CompetitorWatch"("userId","competitorName")`);
  console.log("CompetitorWatch 테이블 OK");
  console.log((await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='CompetitorWatch' ORDER BY ordinal_position`)).rows.map((r: { column_name: string }) => r.column_name).join(", "));
  await pool.end();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
