// 미구현 감사용 데이터 실측 (읽기 전용) — 실시간 스냅샷·CompanyProfile·UserAlert
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  if (t.slice(0, i).trim() === "DATABASE_URL") dbUrl = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 30000 });
const q = async (s: string) => { try { return (await pool.query(s)).rows; } catch (e) { return [{ err: (e as Error).message.slice(0, 80) }]; } };

(async () => {
  console.log("ParticipantSnapshot 총:", JSON.stringify(await q(`SELECT COUNT(*)::int c FROM "ParticipantSnapshot"`)));
  console.log("ParticipantSnapshot 최근7일:", JSON.stringify(await q(`SELECT COUNT(*)::int c FROM "ParticipantSnapshot" WHERE "capturedAt" > NOW() - INTERVAL '7 days'`)));
  console.log("CompanyProfile:", JSON.stringify(await q(`SELECT COUNT(*)::int c FROM "CompanyProfile"`)));
  console.log("CompanyProfile 필드:", JSON.stringify(await q(`SELECT "mainCategory", COALESCE(array_length("subCategories",1),0) subs FROM "CompanyProfile" LIMIT 3`)));
  console.log("UserAlert 활성:", JSON.stringify(await q(`SELECT COUNT(*)::int c FROM "UserAlert" WHERE active`)));
  console.log("CompetitorProfile:", JSON.stringify(await q(`SELECT COUNT(*)::int c FROM "CompetitorProfile"`)));
  await pool.end();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
