// P0-1: Plan 5티어 마이그레이션 (2026-07-09 박상빈님 확정)
//  순서 필수: ①enum 추가 ②grandfathered 컬럼 ③기존 전원 영구PRO 마킹 ④default FREE 변경
//  (③→④ 순서 역전 금지 — 기존 유저 차단 사고 방지)
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
  console.log("=== 사전 상태 ===");
  console.log((await pool.query(`SELECT plan, COUNT(*)::int c FROM "User" GROUP BY 1`)).rows);

  // ① Plan enum 값 추가 (트랜잭션 밖 autocommit)
  for (const v of ["LITE", "BIZ", "MASTER"]) {
    await pool.query(`ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS '${v}'`);
    console.log(`enum ${v} 추가 OK`);
  }

  // ② grandfathered 컬럼
  await pool.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "grandfathered" BOOLEAN NOT NULL DEFAULT false`);
  console.log("grandfathered 컬럼 OK");

  // ③ 기존 사용자 전원 영구 PRO 마킹 (박상빈님 7/9 명시: 기존사용자 영구 프로플랜)
  const r = await pool.query(`UPDATE "User" SET "grandfathered" = true, plan = 'PRO' WHERE "grandfathered" = false`);
  console.log(`기존 사용자 영구 PRO 마킹: ${r.rowCount}명`);

  // ④ 신규 가입 default FREE (③ 완료 후에만)
  await pool.query(`ALTER TABLE "User" ALTER COLUMN "plan" SET DEFAULT 'FREE'`);
  console.log("User.plan default FREE OK");

  console.log("=== 사후 검증 ===");
  console.log((await pool.query(`SELECT plan, "grandfathered", COUNT(*)::int c FROM "User" GROUP BY 1,2`)).rows);
  console.log((await pool.query(`SELECT column_default FROM information_schema.columns WHERE table_name='User' AND column_name='plan'`)).rows);
  console.log((await pool.query(`SELECT unnest(enum_range(NULL::"Plan"))::text AS v`)).rows.map((x: { v: string }) => x.v).join(", "));
  await pool.end();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
