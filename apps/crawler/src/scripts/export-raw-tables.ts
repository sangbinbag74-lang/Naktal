/**
 * Raw 테이블 COPY 덤프 (Supabase 서버 JOIN 완전 회피)
 *
 * 각 테이블 필요 컬럼만 COPY TO STDOUT → 로컬 CSV 스트림
 * Python pandas로 로컬 merge → 최종 학습 CSV 생성
 *
 * 실행: pnpm ts-node src/scripts/export-raw-tables.ts
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";
import { to as copyTo } from "pg-copy-streams";
import { pipeline } from "stream/promises";

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

const OUT_DIR = path.resolve(__dirname, "../../../../apps/ml/data/raw");

interface TableSpec {
  name: string;
  sql: string;
}

const TABLES: TableSpec[] = [
  {
    name: "announcement",
    sql: `
      COPY (
        SELECT
          "konepsId",
          category,
          "orgName",
          COALESCE(NULLIF(region, ''), '전국') AS region,
          deadline,
          budget::bigint AS budget,
          "bsisAmt"::bigint AS bsis_amt,
          "sucsfbidLwltRate" AS lwlt_rate,
          "aValueTotal"::bigint AS avalue_total,
          COALESCE("subCategories"[1], '') AS subcat_main,
          "rsrvtnPrceRngBgnRate" AS rsrvtn_bgn,
          "rsrvtnPrceRngEndRate" AS rsrvtn_end,
          "ciblAplYn" AS cibl_apl_yn,
          "bidNtceDtlUrl" AS bid_url
        FROM "Announcement"
        WHERE deadline >= '2015-01-01'::timestamptz
          AND deadline < '2027-01-01'::timestamptz
          AND budget::bigint > 0
      ) TO STDOUT WITH CSV HEADER
    `,
  },
  {
    name: "bidresult",
    sql: `
      COPY (
        SELECT
          "annId",
          "bidRate",
          "finalPrice"::bigint AS final_price,
          "numBidders",
          "openedAt"
        FROM "BidResult"
        WHERE "finalPrice"::bigint > 0
          AND "bidRate"::numeric > 0
          AND "numBidders" > 0
          AND "numBidders" < 500
      ) TO STDOUT WITH CSV HEADER
    `,
  },
  {
    name: "sajungstat",
    sql: `
      COPY (
        SELECT
          "orgName", category, "budgetRange", region,
          avg, stddev, p25, p75, "sampleSize",
          "monthlyAvg"
        FROM "SajungRateStat"
        WHERE "sampleSize" >= 10
      ) TO STDOUT WITH CSV HEADER
    `,
  },
  {
    name: "opening",
    sql: `
      COPY (
        SELECT
          "annId",
          "selPrdprcIdx",
          COALESCE("bidCount", 0) AS bid_count,
          "openingDate"
        FROM "BidOpeningDetail"
        WHERE array_length("selPrdprcIdx", 1) >= 4
      ) TO STDOUT WITH CSV HEADER
    `,
  },
  {
    name: "chg_count",
    sql: `
      COPY (
        SELECT
          "annId",
          COUNT(*)::int AS chg_count
        FROM "AnnouncementChgHst"
        GROUP BY "annId"
      ) TO STDOUT WITH CSV HEADER
    `,
  },
  {
    // KoBERT 시도용 (konepsId, title) 보조 dump — announcement.csv 본체와 분리해 작게 유지
    name: "ann_title",
    sql: `
      COPY (
        SELECT "konepsId", title
        FROM "Announcement"
        WHERE deadline >= '2015-01-01'::timestamptz
          AND deadline < '2027-01-01'::timestamptz
          AND budget::bigint > 0
      ) TO STDOUT WITH CSV HEADER
    `,
  },
];

async function dumpTable(pool: Pool, spec: TableSpec): Promise<void> {
  const outPath = path.join(OUT_DIR, `${spec.name}.csv`);
  const t0 = Date.now();
  console.log(`\n[${spec.name}] 덤프 시작 → ${outPath}`);

  const client = await pool.connect();
  try {
    const readStream = client.query(copyTo(spec.sql));
    const writeStream = fs.createWriteStream(outPath);
    await pipeline(readStream, writeStream);
    const size = fs.statSync(outPath).size;
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[${spec.name}] ✅ ${(size / 1024 / 1024).toFixed(1)} MB, ${elapsed}초`);
  } finally {
    client.release();
  }
}

async function main() {
  const url = loadDatabaseUrl();
  if (!url) { console.error("DATABASE_URL 없음"); process.exit(1); }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const pool = new Pool({ connectionString: url, max: 4, statement_timeout: 0 });

  const tStart = Date.now();
  console.log(`=== Raw 테이블 COPY 덤프 시작 ===`);
  console.log(`출력 디렉토리: ${OUT_DIR}\n`);

  // 순차 실행 (네트워크 대역폭 공유 방지)
  for (const spec of TABLES) {
    await dumpTable(pool, spec);
  }

  const totalMin = ((Date.now() - tStart) / 1000 / 60).toFixed(1);
  console.log(`\n=== 전체 완료: ${totalMin}분 ===`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
