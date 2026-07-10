// P0-3: 계좌이체 구독 신청 테이블 (토스 계약 전까지 계좌이체 단독, 2026-07-09)
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
    CREATE TABLE IF NOT EXISTS "BankTransferRequest" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "plan" "Plan" NOT NULL,
      "period" TEXT NOT NULL DEFAULT 'MONTHLY',
      "amount" INTEGER NOT NULL,
      "depositorName" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "adminMemo" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "confirmedAt" TIMESTAMP(3)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS "BankTransferRequest_status_idx" ON "BankTransferRequest"("status")`);
  await pool.query(`CREATE INDEX IF NOT EXISTS "BankTransferRequest_userId_idx" ON "BankTransferRequest"("userId")`);
  console.log("BankTransferRequest 테이블 OK");
  console.log((await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='BankTransferRequest' ORDER BY ordinal_position`)).rows);
  await pool.end();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
