/**
 * 전 테이블 타겟 필드 채움율 + 샘플 값 감사
 * 용도: 과거 크롤러가 의도한 대로 실제 값을 채웠는지 즉시 확인
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadDbUrl(): string {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  if (fs.existsSync(rootEnv)) {
    const c = fs.readFileSync(rootEnv, "utf-8");
    for (const l of c.split("\n")) {
      const t = l.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k === "DATABASE_URL" && v) return v;
    }
  }
  const env = process.env.DATABASE_URL;
  if (!env) throw new Error("DATABASE_URL 미설정 (.env 또는 환경변수 필요)");
  return env;
}

interface Check {
  table: string;
  field: string;
  totalSql: string;
  filledSql: string;
  sampleSql: string;
}

const CHECKS: Check[] = [
  // Announcement 핵심 필드
  {
    table: "Announcement", field: "subCategories (업종 필터 핵심)",
    totalSql: `SELECT COUNT(*)::bigint AS n FROM "Announcement"`,
    filledSql: `SELECT COUNT(*)::bigint AS n FROM "Announcement" WHERE "subCategories" IS NOT NULL AND array_length("subCategories",1) > 0`,
    sampleSql: `SELECT "subCategories" FROM "Announcement" WHERE array_length("subCategories",1) > 0 LIMIT 3`,
  },
  {
    table: "Announcement", field: "bsisAmt (기초금액)",
    totalSql: `SELECT COUNT(*)::bigint AS n FROM "Announcement"`,
    filledSql: `SELECT COUNT(*)::bigint AS n FROM "Announcement" WHERE "bsisAmt" > 0`,
    sampleSql: `SELECT "bsisAmt" FROM "Announcement" WHERE "bsisAmt" > 0 LIMIT 3`,
  },
  {
    table: "Announcement", field: "aValueTotal (A값)",
    totalSql: `SELECT COUNT(*)::bigint AS n FROM "Announcement"`,
    filledSql: `SELECT COUNT(*)::bigint AS n FROM "Announcement" WHERE "aValueTotal" > 0`,
    sampleSql: `SELECT "aValueTotal" FROM "Announcement" WHERE "aValueTotal" > 0 LIMIT 3`,
  },
  {
    table: "Announcement", field: "sucsfbidLwltRate (낙찰하한율)",
    totalSql: `SELECT COUNT(*)::bigint AS n FROM "Announcement"`,
    filledSql: `SELECT COUNT(*)::bigint AS n FROM "Announcement" WHERE "sucsfbidLwltRate" > 0`,
    sampleSql: `SELECT "sucsfbidLwltRate" FROM "Announcement" WHERE "sucsfbidLwltRate" > 0 LIMIT 3`,
  },
  {
    table: "Announcement", field: "bidNtceDtlUrl (상세 URL)",
    totalSql: `SELECT COUNT(*)::bigint AS n FROM "Announcement"`,
    filledSql: `SELECT COUNT(*)::bigint AS n FROM "Announcement" WHERE "bidNtceDtlUrl" != ''`,
    sampleSql: `SELECT "bidNtceDtlUrl" FROM "Announcement" WHERE "bidNtceDtlUrl" != '' LIMIT 3`,
  },

  // BidResult 핵심 필드
  {
    table: "BidResult", field: "bidRate",
    totalSql: `SELECT COUNT(*)::bigint AS n FROM "BidResult"`,
    filledSql: `SELECT COUNT(*)::bigint AS n FROM "BidResult" WHERE "bidRate" IS NOT NULL`,
    sampleSql: `SELECT "bidRate" FROM "BidResult" WHERE "bidRate" IS NOT NULL LIMIT 3`,
  },
  {
    table: "BidResult", field: "numBidders",
    totalSql: `SELECT COUNT(*)::bigint AS n FROM "BidResult"`,
    filledSql: `SELECT COUNT(*)::bigint AS n FROM "BidResult" WHERE "numBidders" > 0`,
    sampleSql: `SELECT "numBidders" FROM "BidResult" WHERE "numBidders" > 0 LIMIT 3`,
  },
  {
    table: "BidResult", field: "winnerName",
    totalSql: `SELECT COUNT(*)::bigint AS n FROM "BidResult"`,
    filledSql: `SELECT COUNT(*)::bigint AS n FROM "BidResult" WHERE "winnerName" IS NOT NULL AND "winnerName" != ''`,
    sampleSql: `SELECT "winnerName" FROM "BidResult" WHERE "winnerName" IS NOT NULL LIMIT 3`,
  },

  // BidOpeningDetail — Phase G-1 재수집 대상
  {
    table: "BidOpeningDetail", field: "selPrdprcIdx (Model 2 재료)",
    totalSql: `SELECT COUNT(*)::bigint AS n FROM "BidOpeningDetail"`,
    filledSql: `SELECT COUNT(*)::bigint AS n FROM "BidOpeningDetail" WHERE array_length("selPrdprcIdx",1) >= 4`,
    sampleSql: `SELECT "selPrdprcIdx" FROM "BidOpeningDetail" WHERE array_length("selPrdprcIdx",1) >= 4 LIMIT 3`,
  },
  {
    table: "BidOpeningDetail", field: "prdprcList",
    totalSql: `SELECT COUNT(*)::bigint AS n FROM "BidOpeningDetail"`,
    filledSql: `SELECT COUNT(*)::bigint AS n FROM "BidOpeningDetail" WHERE jsonb_array_length("prdprcList") > 0`,
    sampleSql: `SELECT "prdprcList" FROM "BidOpeningDetail" WHERE jsonb_array_length("prdprcList") > 0 LIMIT 1`,
  },
  {
    table: "BidOpeningDetail", field: "openingDate",
    totalSql: `SELECT COUNT(*)::bigint AS n FROM "BidOpeningDetail"`,
    filledSql: `SELECT COUNT(*)::bigint AS n FROM "BidOpeningDetail" WHERE "openingDate" IS NOT NULL`,
    sampleSql: `SELECT "openingDate" FROM "BidOpeningDetail" WHERE "openingDate" IS NOT NULL LIMIT 3`,
  },

  // SajungRateStat
  {
    table: "SajungRateStat", field: "avg",
    totalSql: `SELECT COUNT(*)::bigint AS n FROM "SajungRateStat"`,
    filledSql: `SELECT COUNT(*)::bigint AS n FROM "SajungRateStat" WHERE "avg" > 0`,
    sampleSql: `SELECT avg, stddev, "sampleSize" FROM "SajungRateStat" WHERE "avg" > 0 LIMIT 3`,
  },

  // AnnouncementChgHst (chgItemNm — 실제 G2B 응답 필드)
  {
    table: "AnnouncementChgHst", field: "chgItemNm (변경 항목명)",
    totalSql: `SELECT COUNT(*)::bigint AS n FROM "AnnouncementChgHst"`,
    filledSql: `SELECT COUNT(*)::bigint AS n FROM "AnnouncementChgHst" WHERE "chgItemNm" IS NOT NULL AND "chgItemNm" != ''`,
    sampleSql: `SELECT "chgItemNm" FROM "AnnouncementChgHst" WHERE "chgItemNm" != '' LIMIT 3`,
  },
];

(async () => {
  const pool = new Pool({ connectionString: loadDbUrl(), statement_timeout: 45000 });
  console.log("=".repeat(70));
  console.log("데이터 품질 감사 (타겟 필드 채움율 + 샘플)");
  console.log("=".repeat(70));

  const summary: { name: string; pct: number; status: string }[] = [];

  for (const c of CHECKS) {
    const label = `${c.table}.${c.field}`;
    console.log(`\n━━━ ${label} ━━━`);
    try {
      const [tot, fill] = await Promise.all([
        pool.query(c.totalSql),
        pool.query(c.filledSql),
      ]);
      const total = Number(tot.rows[0].n);
      const filled = Number(fill.rows[0].n);
      const pct = total > 0 ? (filled / total) * 100 : 0;
      let status = "";
      if (pct < 1) status = "🔴 거의 비어있음";
      else if (pct < 50) status = "🟠 일부만";
      else if (pct < 90) status = "🟡 대다수";
      else status = "🟢 충분";
      console.log(`  전체: ${total.toLocaleString()}`);
      console.log(`  채움: ${filled.toLocaleString()} (${pct.toFixed(2)}%) ${status}`);
      summary.push({ name: label, pct, status });

      if (filled > 0) {
        const s = await pool.query(c.sampleSql);
        console.log(`  샘플:`, JSON.stringify(s.rows, null, 2).slice(0, 400));
      } else {
        console.log(`  ⚠️ 샘플 없음 — 필드 전체 비어있음`);
      }
    } catch (e) {
      console.log(`  ✗ 에러: ${(e as Error).message}`);
      summary.push({ name: label, pct: -1, status: "✗ 쿼리 실패" });
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("요약");
  console.log("=".repeat(70));
  for (const s of summary) {
    const pctStr = s.pct < 0 ? "  ERR" : `${s.pct.toFixed(1).padStart(5)}%`;
    console.log(`  ${pctStr}  ${s.status.slice(0, 4)}  ${s.name}`);
  }

  await pool.end();
})();
