/**
 * Model 2 복수예가 번호 선택 예측 학습 데이터 추출
 *
 * BidOpeningDetail(prdprcList 15개 + selPrdprcIdx 선택된 4개) JOIN Announcement
 *
 * 출력 CSV: 각 행 = 1개 공고
 *   피처: 공고 특성
 *   타겟: sel_1 ~ sel_15 (0 또는 1, 15개 바이너리 레이블)
 *
 * 실행: pnpm ts-node src/scripts/export-opening-data.ts
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

const OUT_PATH = path.resolve(__dirname, "../../../../apps/ml/data/opening_data.csv");
const CHUNK = 20000;

const SEL_COLS = Array.from({ length: 15 }, (_, i) => `sel_${i + 1}`);

const HEADERS = [
  "category", "orgName", "budgetRange", "region",
  "budget_log", "bsisAmt_log", "lwltRate",
  "month", "season_q", "year",
  "numBidders", "aValueTotal_log", "has_avalue",
  "subcat_main",
  ...SEL_COLS,  // sel_1~sel_15 (0 or 1)
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
      const hasCursor = lastDeadline !== null;
      const keysetClause = hasCursor
        ? 'AND (a.deadline, o."annId") > ($1::timestamp, $2::text)'
        : "";
      const params: unknown[] = hasCursor ? [lastDeadline, lastAnnId] : [];

      const q = `
        SELECT
          o."annId"         AS annid,
          a.deadline        AS deadline,
          a.category, a."orgName",
          COALESCE(NULLIF(a.region, ''), '전국') AS region,
          EXTRACT(MONTH FROM a.deadline)::int AS month,
          EXTRACT(YEAR FROM a.deadline)::int  AS year,
          LN(GREATEST(a.budget::numeric, 1))::numeric(10,4) AS budget_log,
          LN(GREATEST(a."bsisAmt"::numeric, 1))::numeric(10,4) AS bsis_log,
          a.budget::bigint                    AS budget,
          a."sucsfbidLwltRate"                AS lwlt_rate,
          a."aValueTotal"::bigint             AS avalue_total,
          COALESCE(a."subCategories"[1], '')  AS subcat_main,
          COALESCE(o."bidCount", b."numBidders", 0) AS num_bidders,
          o."selPrdprcIdx"                    AS sel_idx,
          o."prdprcList"                      AS prdprc_list
        FROM "BidOpeningDetail" o
        JOIN "Announcement" a ON a."konepsId" = o."annId"
        LEFT JOIN "BidResult" b ON b."annId" = o."annId"
        WHERE a.budget::bigint > 0
          AND array_length(o."selPrdprcIdx", 1) >= 4
          AND EXTRACT(YEAR FROM a.deadline) BETWEEN 2015 AND 2026
          ${keysetClause}
        ORDER BY a.deadline, o."annId"
        LIMIT ${CHUNK}
      `;
      const res = await client.query(q, params);
      if (res.rows.length === 0) break;

      for (const r of res.rows) {
        const budget = Number(r.budget);
        if (budget <= 0) continue;
        const aValueTotal = Number(r.avalue_total ?? 0);
        const aValueTotalLog = aValueTotal > 0 ? Math.log(aValueTotal + 1) : 0;
        const hasAvalue = aValueTotal > 0 ? 1 : 0;
        const month = Number(r.month);
        const seasonQ = month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4;
        const yr = Number(r.year);
        const split = yr <= 2023 ? "train" : yr === 2024 ? "val" : "test";

        // selPrdprcIdx: int[] (1-based, 1~15 중 선택된 4개)
        const selIdx: number[] = Array.isArray(r.sel_idx) ? r.sel_idx.map(Number) : [];
        const selFlags = Array(15).fill(0);
        for (const idx of selIdx) {
          if (idx >= 1 && idx <= 15) selFlags[idx - 1] = 1;
        }

        const row = [
          csvEscape(r.category),
          csvEscape(r.orgName),
          csvEscape(budgetRange(budget)),
          csvEscape(r.region),
          Number(r.budget_log).toFixed(4),
          Number(r.bsis_log ?? 0).toFixed(4),
          Number(r.lwlt_rate ?? 87.745).toFixed(3),
          month,
          seasonQ,
          yr,
          Number(r.num_bidders),
          aValueTotalLog.toFixed(4),
          hasAvalue,
          csvEscape(r.subcat_main ?? ""),
          ...selFlags,
          split,
        ];
        out.write(row.join(",") + "\n");
        total++;
        if (split === "train") train++;
        else if (split === "val") val++;
        else test++;
      }

      const lastRow = res.rows[res.rows.length - 1];
      lastDeadline = new Date(lastRow.deadline);
      lastAnnId = String(lastRow.annid);

      console.log(`  +${res.rows.length} | 누적 ${total.toLocaleString()} (t ${train} / v ${val} / te ${test})`);
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
