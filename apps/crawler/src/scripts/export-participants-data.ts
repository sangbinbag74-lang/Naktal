/**
 * Model 3 참여자수 예측 학습 데이터 추출
 *
 * BidResult.numBidders 타겟 + Announcement 특성
 *
 * 출력: apps/ml/data/participants_data.csv
 * 실행: pnpm ts-node src/scripts/export-participants-data.ts
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

const OUT_PATH = path.resolve(__dirname, "../../../../apps/ml/data/participants_data.csv");
const CHUNK = 50000;

const HEADERS = [
  "category", "orgName", "budgetRange", "region",
  "budget_log", "bsisAmt_log", "lwltRate",
  "month", "season_q", "year", "weekday",
  "days_to_deadline",        // 공고일~마감일 간격
  "aValueTotal_log", "has_avalue",
  "subcat_main",
  "org_avg_bidders",         // 해당 발주처 과거 평균 참여자
  "category_avg_bidders",    // 업종 평균 참여자
  "numBidders",              // 타겟: 실제 참여자 수
  "split",
];

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function budgetRange(budget: number): string {
  if (budget < 100_000_000) return "1억미만";
  if (budget < 300_000_000) return "1억-3억";
  if (budget < 1_000_000_000) return "3억-10억";
  if (budget < 3_000_000_000) return "10억-30억";
  return "30억이상";
}

async function main() {
  const url = loadDatabaseUrl();
  if (!url) { console.error("DATABASE_URL 없음"); process.exit(1); }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  const out = fs.createWriteStream(OUT_PATH, { encoding: "utf-8" });
  out.write(HEADERS.join(",") + "\n");

  const pool = new Pool({ connectionString: url, max: 2, statement_timeout: 0 });
  const client = await pool.connect();
  let total = 0, train = 0, val = 0, test = 0;
  try {
    console.log(`출력: ${OUT_PATH}`);

    let lastDeadline: Date | null = null;
    let lastAnnId: string | null = null;
    while (true) {
      const hasCursor: boolean = lastDeadline !== null;
      const keysetClause: string = hasCursor
        ? 'AND (a.deadline, b."annId") > ($1::timestamp, $2::text)'
        : "";
      const params: unknown[] = hasCursor ? [lastDeadline, lastAnnId] : [];

      const q: string = `
        SELECT
          b."annId"           AS annid,
          a.deadline,
          a.category, a."orgName",
          COALESCE(NULLIF(a.region, ''), '전국') AS region,
          a.budget::bigint    AS budget,
          a."bsisAmt"::bigint AS bsis_amt,
          a."sucsfbidLwltRate" AS lwlt_rate,
          EXTRACT(MONTH FROM a.deadline)::int AS month,
          EXTRACT(YEAR FROM a.deadline)::int  AS year,
          EXTRACT(DOW FROM a.deadline)::int   AS weekday,
          a."aValueTotal"::bigint AS avalue_total,
          COALESCE(a."subCategories"[1], '') AS subcat_main,
          LEAST(b."numBidders", 1000) AS num_bidders
        FROM "BidResult" b
        JOIN "Announcement" a ON a."konepsId" = b."annId"
        WHERE a.budget::bigint > 0
          AND b."numBidders" > 0
          AND b."numBidders" < 500
          AND EXTRACT(YEAR FROM a.deadline) BETWEEN 2015 AND 2026
          ${keysetClause}
        ORDER BY a.deadline, b."annId"
        LIMIT ${CHUNK}
      `;
      const res: { rows: Record<string, unknown>[] } = await client.query(q, params);
      if (res.rows.length === 0) break;

      for (const r of res.rows) {
        const budget = Number(r.budget);
        if (budget <= 0) continue;
        const bsisAmt = Number(r.bsis_amt ?? 0);
        const aValueTotal = Number(r.avalue_total ?? 0);
        const month = Number(r.month);
        const seasonQ = month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4;
        const yr = Number(r.year);
        const split = yr <= 2023 ? "train" : yr === 2024 ? "val" : "test";

        // 공고일자 정보 없으면 0 (학습에서 무시)
        const daysToDeadline = 7; // placeholder (bidNtceDt→deadline 갭은 평균 1주)

        const row = [
          csvEscape(r.category),
          csvEscape(r.orgName),
          csvEscape(budgetRange(budget)),
          csvEscape(r.region),
          Math.log(budget + 1).toFixed(4),
          bsisAmt > 0 ? Math.log(bsisAmt + 1).toFixed(4) : "0",
          Number(r.lwlt_rate ?? 87.745).toFixed(3),
          month,
          seasonQ,
          yr,
          Number(r.weekday),
          daysToDeadline,
          aValueTotal > 0 ? Math.log(aValueTotal + 1).toFixed(4) : "0",
          aValueTotal > 0 ? 1 : 0,
          csvEscape(r.subcat_main ?? ""),
          "0", // org_avg_bidders: 학습 중 DataFrame에서 계산
          "0", // category_avg_bidders: 학습 중 계산
          Number(r.num_bidders),
          split,
        ];
        out.write(row.join(",") + "\n");
        total++;
        if (split === "train") train++;
        else if (split === "val") val++;
        else test++;
      }

      const lastRow = res.rows[res.rows.length - 1] as { deadline: string; annid: string };
      lastDeadline = new Date(lastRow.deadline);
      lastAnnId = String(lastRow.annid);

      console.log(`  +${res.rows.length} | 누적 ${total.toLocaleString()}`);
      if (res.rows.length < CHUNK) break;
    }

    console.log(`\n완료: 총 ${total.toLocaleString()}건`);
    console.log(`  Train: ${train.toLocaleString()} / Val: ${val.toLocaleString()} / Test: ${test.toLocaleString()}`);
  } finally {
    out.end();
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
