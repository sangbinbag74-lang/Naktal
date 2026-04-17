/**
 * ML 학습용 CSV 추출
 *
 * BidResult JOIN Announcement JOIN SajungRateStat → 피처 CSV 출력
 * 필터: 사정율 97~103% + sampleSize≥10 + 유효 budget/bidRate
 *
 * Split 규칙 (수집 가능한 전체 기간 활용):
 *   train: 2002~2023 (갭 재수집으로 2023 정상화됨)
 *   val:   2024
 *   test:  2025~2026
 *
 * 출력: apps/ml/data/training_data.csv
 * 실행: pnpm ts-node src/scripts/export-training-data.ts
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadDatabaseUrl(): string | undefined {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  try {
    const content = fs.readFileSync(rootEnv, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (key === "DATABASE_URL" && val && !val.includes("[YOUR-PASSWORD]")) return val;
    }
  } catch {}
  return process.env.DATABASE_URL;
}

const OUT_PATH = path.resolve(__dirname, "../../../../apps/ml/data/training_data.csv");
const CHUNK = 50000;

const HEADERS = [
  "category", "orgName", "budgetRange", "region", "month", "year",
  "budget_log", "numBidders",
  "stat_avg", "stat_stddev", "stat_p25", "stat_p75", "sampleSize",
  "bidder_volatility", "is_sparse_org", "season_q",
  "sajung_rate", "split",
];

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function main() {
  const url = loadDatabaseUrl();
  if (!url) { console.error("DATABASE_URL 없음"); process.exit(1); }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  const out = fs.createWriteStream(OUT_PATH, { encoding: "utf-8" });
  out.write(HEADERS.join(",") + "\n");

  const pool = new Pool({ connectionString: url, max: 2 });
  const client = await pool.connect();
  let total = 0, train = 0, val = 0, test = 0;
  try {
    console.log(`출력: ${OUT_PATH}`);
    console.log("청크별 조회 시작...");

    // keyset pagination: (deadline, konepsId) 커서로 스캔 → OFFSET 성능 문제 회피
    let lastDeadline: Date | null = null;
    let lastKonepsId: string | null = null;
    while (true) {
      const hasCursor: boolean = lastDeadline !== null;
      const keysetClause: string = hasCursor
        ? 'AND (a.deadline, a."konepsId") > ($1::timestamp, $2::text)'
        : "";
      const params: unknown[] = hasCursor ? [lastDeadline, lastKonepsId] : [];
      const q = `
        SELECT
          a.category, a."orgName", s."budgetRange",
          COALESCE(NULLIF(a.region, ''), '전국') AS region,
          EXTRACT(MONTH FROM a.deadline)::int AS month,
          EXTRACT(YEAR FROM a.deadline)::int  AS year,
          a.deadline                          AS deadline,
          a."konepsId"                        AS konepsid,
          LN(a.budget::numeric)::numeric(10,4) AS budget_log,
          LEAST(b."numBidders", 500)          AS num_bidders,
          s.avg                               AS stat_avg,
          COALESCE(s.stddev, 2.0)             AS stat_stddev,
          s.p25, s.p75, s."sampleSize",
          a.budget::bigint                    AS budget,
          (b."finalPrice"::numeric / (b."bidRate"::numeric / 100.0)) / a.budget::numeric * 100 AS sajung_rate
        FROM "BidResult" b
        JOIN "Announcement" a ON a."konepsId" = b."annId"
        JOIN "SajungRateStat" s ON s."orgName" = a."orgName"
          AND s.category = a.category
          AND s."budgetRange" = (
            CASE
              WHEN a.budget::bigint < 100000000   THEN '1억미만'
              WHEN a.budget::bigint < 300000000   THEN '1억-3억'
              WHEN a.budget::bigint < 1000000000  THEN '3억-10억'
              WHEN a.budget::bigint < 3000000000  THEN '10억-30억'
              ELSE '30억이상'
            END
          )
          AND s.region = a.region
        WHERE b."finalPrice"::bigint > 0
          AND b."bidRate"::numeric > 0
          AND a.budget::bigint > 0
          AND b."numBidders" > 0
          AND s."sampleSize" >= 10
          AND EXTRACT(YEAR FROM a.deadline) BETWEEN 2002 AND 2026
          AND (b."finalPrice"::numeric / (b."bidRate"::numeric / 100.0)) / a.budget::numeric * 100
            BETWEEN 97 AND 103
          ${keysetClause}
        ORDER BY a.deadline, a."konepsId"
        LIMIT ${CHUNK}
      `;
      const res = await client.query(q, params);
      if (res.rows.length === 0) break;

      for (const r of res.rows) {
        const statAvg = Number(r.stat_avg);
        const statStddev = Number(r.stat_stddev);
        const volatility = statAvg > 0 ? statStddev / statAvg : 0;
        const isSparse = Number(r.sampleSize) < 30 ? 1 : 0;
        const month = Number(r.month);
        const seasonQ = month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4;
        const yr = Number(r.year);
        const split = yr <= 2023 ? "train" : yr === 2024 ? "val" : "test";

        const row = [
          csvEscape(r.category),
          csvEscape(r.orgName),
          csvEscape(r.budgetRange),
          csvEscape(r.region),
          month,
          r.year,
          Number(r.budget_log).toFixed(4),
          Number(r.num_bidders),
          Number(r.stat_avg).toFixed(3),
          Number(r.stat_stddev).toFixed(3),
          Number(r.p25).toFixed(3),
          Number(r.p75).toFixed(3),
          Number(r.sampleSize),
          volatility.toFixed(6),
          isSparse,
          seasonQ,
          Number(r.sajung_rate).toFixed(4),
          split,
        ];
        out.write(row.join(",") + "\n");
        total++;
        if (split === "train") train++;
        else if (split === "val") val++;
        else test++;
      }

      // keyset 커서 업데이트 (마지막 행의 deadline/konepsId)
      const lastRow = res.rows[res.rows.length - 1];
      lastDeadline = new Date(lastRow.deadline);
      lastKonepsId = String(lastRow.konepsid);

      if (total % 100000 === 0 || res.rows.length < CHUNK) {
        console.log(`  ${total.toLocaleString()}건 (train ${train.toLocaleString()} / val ${val.toLocaleString()} / test ${test.toLocaleString()})`);
      }
      if (res.rows.length < CHUNK) break;
    }

    console.log(`\n완료: 총 ${total.toLocaleString()}건 저장`);
    console.log(`  Train (2002~2023): ${train.toLocaleString()}`);
    console.log(`  Val   (2024):      ${val.toLocaleString()}`);
    console.log(`  Test  (2025~2026): ${test.toLocaleString()}`);
    console.log(`  파일: ${OUT_PATH}`);
  } finally {
    out.end();
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
