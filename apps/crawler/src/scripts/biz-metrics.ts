// 비즈니스 지표 조회 (읽기 전용) — 무료+구독 전환 검토용
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
const q = async (sql: string) => (await pool.query(sql)).rows;
const one = async (sql: string) => (await q(sql))[0];

(async () => {
  console.log("===== 사용자 =====");
  console.log("총 가입:", (await one(`SELECT COUNT(*)::int c FROM "User"`)).c);
  console.log("활성:", (await one(`SELECT COUNT(*)::int c FROM "User" WHERE "isActive"`)).c);
  console.log("최근30일 가입:", (await one(`SELECT COUNT(*)::int c FROM "User" WHERE "createdAt">NOW()-INTERVAL '30 days'`)).c);
  console.log("최근7일 가입:", (await one(`SELECT COUNT(*)::int c FROM "User" WHERE "createdAt">NOW()-INTERVAL '7 days'`)).c);
  console.log("카카오인증:", (await one(`SELECT COUNT(*)::int c FROM "User" WHERE "kakaoId" IS NOT NULL`)).c);
  console.log("플랜분포:", JSON.stringify(await q(`SELECT plan, COUNT(*)::int c FROM "User" GROUP BY 1 ORDER BY 2 DESC`)));
  console.log("월별가입:", JSON.stringify(await q(`SELECT to_char("createdAt",'YYYY-MM') m, COUNT(*)::int c FROM "User" GROUP BY 1 ORDER BY 1 DESC LIMIT 8`)));

  console.log("\n===== 투찰 의뢰 (BidRequest) =====");
  console.log("총 의뢰:", (await one(`SELECT COUNT(*)::int c FROM "BidRequest"`)).c);
  console.log("낙찰:", (await one(`SELECT COUNT(*)::int c FROM "BidRequest" WHERE "isWon"=true`)).c);
  console.log("미낙찰:", (await one(`SELECT COUNT(*)::int c FROM "BidRequest" WHERE "isWon"=false`)).c);
  console.log("개찰대기:", (await one(`SELECT COUNT(*)::int c FROM "BidRequest" WHERE "isWon" IS NULL`)).c);
  console.log("월별 의뢰:", JSON.stringify(await q(`SELECT to_char("createdAt",'YYYY-MM') m, COUNT(*)::int c FROM "BidRequest" GROUP BY 1 ORDER BY 1 DESC LIMIT 6`)));

  console.log("\n===== 수수료 =====");
  console.log("feeStatus별:", JSON.stringify(await q(`SELECT COALESCE("feeStatus",'(없음)') fs, COUNT(*)::int c, COALESCE(SUM("feeAmount"),0)::bigint s FROM "BidRequest" GROUP BY 1`)));
  console.log("실현수수료(invoiced+paid):", (await one(`SELECT COALESCE(SUM("feeAmount"),0)::bigint s FROM "BidRequest" WHERE "feeStatus" IN ('invoiced','paid')`)).s);

  console.log("\n===== 구독 =====");
  console.log("구독분포:", JSON.stringify(await q(`SELECT status, COUNT(*)::int c FROM "Subscription" GROUP BY 1`)));

  console.log("\n===== 분석 활동 =====");
  console.log("번호추천 이력:", (await one(`SELECT COUNT(*)::int c FROM "NumberRecommendation"`)).c);

  await pool.end();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
