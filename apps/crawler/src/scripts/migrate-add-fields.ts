/**
 * DB 마이그레이션: Announcement 컬럼 추가 + BidOpeningDetail, AnnouncementChgHst 테이블 신설
 * Supabase prod DB에 직접 pg 연결로 실행.
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

const STMTS: { name: string; sql: string }[] = [
  // Announcement 컬럼 추가
  {
    name: "ALTER Announcement add 11 columns",
    sql: `
      ALTER TABLE "Announcement"
        ADD COLUMN IF NOT EXISTS "aValueDetails"        jsonb,
        ADD COLUMN IF NOT EXISTS "bsisAmt"              bigint DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "rsrvtnPrceRngBgnRate" double precision DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "rsrvtnPrceRngEndRate" double precision DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "sucsfbidLwltRate"     double precision DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "prtcptPsblRgnNm"      text DEFAULT '',
        ADD COLUMN IF NOT EXISTS "jntcontrctDutyRgnNm"  text DEFAULT '',
        ADD COLUMN IF NOT EXISTS "ciblAplYn"            text DEFAULT '',
        ADD COLUMN IF NOT EXISTS "mtltyAdvcPsblYn"      text DEFAULT '',
        ADD COLUMN IF NOT EXISTS "bidNtceDtlUrl"        text DEFAULT '',
        ADD COLUMN IF NOT EXISTS "ntceInsttOfclTelNo"   text DEFAULT ''
    `,
  },
  // BidOpeningDetail
  {
    name: "CREATE BidOpeningDetail",
    sql: `
      CREATE TABLE IF NOT EXISTS "BidOpeningDetail" (
        id             text PRIMARY KEY,
        "annId"        text UNIQUE NOT NULL,
        "prdprcList"   jsonb NOT NULL,
        "selPrdprcIdx" integer[] DEFAULT '{}',
        "openingDate"  timestamp(3),
        "bidCount"     integer,
        "sucsfbidRate" double precision,
        "rawJson"      jsonb,
        "createdAt"    timestamp(3) DEFAULT NOW(),
        "updatedAt"    timestamp(3) DEFAULT NOW()
      )
    `,
  },
  {
    name: "idx_bidopendetail_openingdate",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_bidopendetail_openingdate" ON "BidOpeningDetail" ("openingDate" DESC)`,
  },
  // AnnouncementChgHst
  {
    name: "CREATE AnnouncementChgHst",
    sql: `
      CREATE TABLE IF NOT EXISTS "AnnouncementChgHst" (
        id           text PRIMARY KEY,
        "annId"      text NOT NULL,
        "chgNtceSeq" integer NOT NULL,
        "chgRsnNm"   text DEFAULT '',
        "chgBefore"  jsonb,
        "chgAfter"   jsonb,
        "chgDate"    timestamp(3),
        "rawJson"    jsonb,
        "createdAt"  timestamp(3) DEFAULT NOW(),
        UNIQUE ("annId", "chgNtceSeq")
      )
    `,
  },
  {
    name: "idx_chghst_annid",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_chghst_annid" ON "AnnouncementChgHst" ("annId")`,
  },
];

async function main() {
  const url = loadDatabaseUrl();
  if (!url) { console.error("DATABASE_URL 없음"); process.exit(1); }
  const pool = new Pool({ connectionString: url, max: 1 });
  for (const { name, sql } of STMTS) {
    const c = await pool.connect();
    try {
      const t0 = Date.now();
      console.log(`실행: ${name}`);
      await c.query(sql);
      console.log(`  ✓ ${((Date.now() - t0) / 1000).toFixed(2)}초`);
    } catch (e) {
      console.error(`  ✗ ${(e as Error).message}`);
    } finally { c.release(); }
  }
  await pool.end();
  console.log("\n마이그레이션 완료");
}

main().catch((e) => { console.error(e); process.exit(1); });
