/**
 * RLS 활성화 + 기본 정책 적용
 *
 * HIGH 3개 (사용자 데이터): 본인 것만 조회 정책
 * LOW 3개 (공개 데이터): public read 정책
 *
 * 크롤러는 BYPASSRLS postgres role이라 영향 없음.
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadDatabaseUrl(): string | undefined {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  try {
    const c = fs.readFileSync(rootEnv, "utf-8");
    for (const l of c.split("\n")) {
      const t = l.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k === "DATABASE_URL" && v && !v.includes("[YOUR-PASSWORD]")) return v;
    }
  } catch {}
  return process.env.DATABASE_URL;
}

const PATCHES = [
  // ─── HIGH: 사용자 데이터 보호 ──────────────────────────────
  {
    table: "AnnouncementVisit",
    category: "HIGH",
    sql: [
      `ALTER TABLE "AnnouncementVisit" ENABLE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS "own_visits" ON "AnnouncementVisit"`,
      `CREATE POLICY "own_visits" ON "AnnouncementVisit" FOR ALL USING (auth.uid()::text = "userId")`,
    ],
  },
  {
    table: "BidRequest",
    category: "HIGH",
    sql: [
      `ALTER TABLE "BidRequest" ENABLE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS "own_requests" ON "BidRequest"`,
      `CREATE POLICY "own_requests" ON "BidRequest" FOR ALL USING (auth.uid()::text = "userId")`,
    ],
  },
  {
    table: "WinProbSimulation",
    category: "HIGH",
    sql: [
      `ALTER TABLE "WinProbSimulation" ENABLE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS "own_sims" ON "WinProbSimulation"`,
      `CREATE POLICY "own_sims" ON "WinProbSimulation" FOR ALL USING (auth.uid()::text = "userId")`,
    ],
  },
  // ─── LOW: 공개 데이터 (읽기만 허용) ────────────────────────
  {
    table: "AnnouncementChgHst",
    category: "LOW-public",
    sql: [
      `ALTER TABLE "AnnouncementChgHst" ENABLE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS "public_read" ON "AnnouncementChgHst"`,
      `CREATE POLICY "public_read" ON "AnnouncementChgHst" FOR SELECT USING (true)`,
    ],
  },
  {
    table: "BidOpeningDetail",
    category: "LOW-public",
    sql: [
      `ALTER TABLE "BidOpeningDetail" ENABLE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS "public_read" ON "BidOpeningDetail"`,
      `CREATE POLICY "public_read" ON "BidOpeningDetail" FOR SELECT USING (true)`,
    ],
  },
  {
    table: "PreStdrd",
    category: "LOW-public",
    sql: [
      `ALTER TABLE "PreStdrd" ENABLE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS "public_read" ON "PreStdrd"`,
      `CREATE POLICY "public_read" ON "PreStdrd" FOR SELECT USING (true)`,
    ],
  },
  // ─── MEDIUM: 공통 캐시/통계 (읽기 공개) ─────────────────────
  {
    table: "AIPrediction",
    category: "MEDIUM-cache",
    sql: [
      `ALTER TABLE "AIPrediction" ENABLE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS "public_read" ON "AIPrediction"`,
      `CREATE POLICY "public_read" ON "AIPrediction" FOR SELECT USING (true)`,
    ],
  },
  {
    table: "BidPricePrediction",
    category: "MEDIUM-cache",
    sql: [
      `ALTER TABLE "BidPricePrediction" ENABLE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS "public_read" ON "BidPricePrediction"`,
      `CREATE POLICY "public_read" ON "BidPricePrediction" FOR SELECT USING (true)`,
    ],
  },
  {
    table: "SajungAnalysisCache",
    category: "MEDIUM-cache",
    sql: [
      `ALTER TABLE "SajungAnalysisCache" ENABLE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS "public_read" ON "SajungAnalysisCache"`,
      `CREATE POLICY "public_read" ON "SajungAnalysisCache" FOR SELECT USING (true)`,
    ],
  },
  {
    table: "SajungRateStat",
    category: "MEDIUM-cache",
    sql: [
      `ALTER TABLE "SajungRateStat" ENABLE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS "public_read" ON "SajungRateStat"`,
      `CREATE POLICY "public_read" ON "SajungRateStat" FOR SELECT USING (true)`,
    ],
  },
  {
    table: "CompetitorProfile",
    category: "MEDIUM-cache",
    sql: [
      `ALTER TABLE "CompetitorProfile" ENABLE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS "public_read" ON "CompetitorProfile"`,
      `CREATE POLICY "public_read" ON "CompetitorProfile" FOR SELECT USING (true)`,
    ],
  },
  // ─── _prisma_migrations는 내부 테이블이지만 경고 제거 위해 RLS만 ON ─────
  {
    table: "_prisma_migrations",
    category: "INTERNAL",
    sql: [
      `ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY`,
      // 정책 없음 → 일반 유저는 아무것도 못 봄. postgres는 BYPASSRLS
    ],
  },
];

async function main() {
  const pool = new Pool({ connectionString: loadDatabaseUrl()!, max: 1 });
  const c = await pool.connect();
  try {
    console.log(`=== RLS 적용 ===\n`);

    let ok = 0;
    let fail = 0;
    for (const p of PATCHES) {
      console.log(`[${p.category}] ${p.table}`);
      try {
        for (const sql of p.sql) {
          await c.query(sql);
          console.log(`  ✅ ${sql.slice(0, 80)}`);
        }
        ok++;
      } catch (e) {
        console.error(`  ❌ ${(e as Error).message}`);
        fail++;
      }
    }
    console.log(`\n=== 완료: 성공 ${ok} / 실패 ${fail} ===`);

    // 최종 확인
    const v = await c.query(`
      SELECT tablename, rowsecurity AS rls_on
      FROM pg_tables WHERE schemaname = 'public'
        AND tablename = ANY($1::text[])
      ORDER BY rowsecurity, tablename
    `, [PATCHES.map(p => p.table)]);
    console.log(`\n[최종 상태]`);
    for (const row of v.rows) {
      console.log(`  ${row.rls_on ? "✅" : "❌"} ${row.tablename} RLS=${row.rls_on ? "ON" : "OFF"}`);
    }
  } finally {
    c.release();
    await pool.end();
  }
}
main().catch(console.error);
