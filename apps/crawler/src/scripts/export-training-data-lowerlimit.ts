// 낙찰하한가 직접 학습용 training data 추출 — Phase 3 재설계
//
// 라벨: BidResult.bidRate (1위 투찰률) ≈ 낙찰하한가 / 기초금액
// 입력: Announcement + SajungRateStat + Expanding mean
//
// 출력: apps/ml/data/training_data_lowerlimit.csv
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

function loadEnv(p: string) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnv(path.resolve(__dirname, "../../../../.env.local"));
loadEnv(path.resolve(__dirname, "../../../../.env"));
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL 없음");

const OUT_DIR = path.resolve(__dirname, "../../../ml/data");
const OUT_PATH = path.join(OUT_DIR, "training_data_lowerlimit.csv");

function budgetRange(b: number): string {
  if (b < 100_000_000)   return "1억미만";
  if (b < 300_000_000)   return "1억-3억";
  if (b < 1_000_000_000) return "3억-10억";
  if (b < 3_000_000_000) return "10억-30억";
  return "30억이상";
}

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  try {
    console.log("[1/2] 학습 데이터 추출 중...");
    // 공사 카테고리 + bidRate 유효 + 기초금액 있음 + 2015년 이후
    const r = await pool.query(`
      SELECT
        ann.id AS "annId",
        ann.category,
        ann."orgName",
        ann.region,
        ann.budget,
        ann.deadline,
        ann."bsisAmt",
        ann."aValueAmt",
        ann."aValueTotal",
        ann."aValueYn",
        ann."sucsfbidLwltRate" AS "lwltRate",
        ann."subCategories",
        br."bidRate" AS "winrate",
        br."numBidders",
        s."sampleSize" AS "stat_sampleSize",
        s.avg          AS "stat_avg",
        s.stddev       AS "stat_stddev"
      FROM "BidResult" br
      JOIN "Announcement" ann ON ann."konepsId" = br."annId"
      LEFT JOIN "SajungRateStat" s
        ON s."orgName" = ann."orgName"
       AND s.category = ann.category
       AND s."budgetRange" = (
            CASE
              WHEN ann.budget < 100000000 THEN '1억미만'
              WHEN ann.budget < 300000000 THEN '1억-3억'
              WHEN ann.budget < 1000000000 THEN '3억-10억'
              WHEN ann.budget < 3000000000 THEN '10억-30억'
              ELSE '30억이상'
            END)
       AND s.region = ann.region
      WHERE ann.category ILIKE '%공사%'
        AND br."bidRate" BETWEEN 80 AND 100
        AND ann."bsisAmt" > 0
        AND ann.deadline >= '2015-01-01'
        AND ann.deadline < NOW()
      ORDER BY ann.deadline ASC
    `);
    console.log(`  ${r.rowCount}건 추출`);

    console.log("[2/2] CSV 출력 + split 라벨 (train: ~2023 / val: 2024 / test: 2025+)...");
    const headers = [
      "annId", "category", "orgName", "budgetRange", "region", "subcat_main",
      "month", "year", "weekday", "season_q",
      "budget_log", "numBidders",
      "stat_avg", "stat_stddev", "sampleSize",
      "aValueTotal_log", "aValue_ratio", "has_avalue",
      "bsisAmt_log", "bsis_to_budget",
      "lwltRate",
      "org_past_winrate_mean", "org_past_winrate_std", "org_past_winrate_cnt",
      "cat_past_winrate_mean", "cat_past_winrate_std", "cat_past_winrate_cnt",
      "winrate", "split",
    ];

    // Expanding mean — 시간 정렬 후 누적
    const orgMap = new Map<string, { sum: number; sq: number; cnt: number }>();
    const catMap = new Map<string, { sum: number; sq: number; cnt: number }>();

    const lines: string[] = [headers.join(",")];
    for (const row of r.rows) {
      const dl = new Date(row.deadline);
      const month = dl.getMonth() + 1;
      const year = dl.getFullYear();
      const weekday = dl.getDay();
      const season_q = Math.ceil(month / 3);
      const budget = Number(row.budget ?? 0);
      const aValue = Number(row.aValueTotal ?? 0);
      const bsis = Number(row.bsisAmt ?? 0);
      const subs: string[] = (row.subCategories ?? []) as string[];
      const subcat_main = subs[0] ?? "";

      // expanding mean — 이 시점까지 누적된 통계
      const orgKey = String(row.orgName ?? "");
      const catKey = String(row.category ?? "");
      const oa = orgMap.get(orgKey) ?? { sum: 0, sq: 0, cnt: 0 };
      const ca = catMap.get(catKey) ?? { sum: 0, sq: 0, cnt: 0 };
      const org_past_mean = oa.cnt > 0 ? oa.sum / oa.cnt : 0;
      const org_past_std  = oa.cnt > 1 ? Math.sqrt((oa.sq / oa.cnt) - (org_past_mean * org_past_mean)) : 0;
      const cat_past_mean = ca.cnt > 0 ? ca.sum / ca.cnt : 0;
      const cat_past_std  = ca.cnt > 1 ? Math.sqrt((ca.sq / ca.cnt) - (cat_past_mean * cat_past_mean)) : 0;

      const winrate = Number(row.winrate);
      // 학습 후 통계 누적
      orgMap.set(orgKey, { sum: oa.sum + winrate, sq: oa.sq + winrate * winrate, cnt: oa.cnt + 1 });
      catMap.set(catKey, { sum: ca.sum + winrate, sq: ca.sq + winrate * winrate, cnt: ca.cnt + 1 });

      const split = year < 2024 ? "train" : year === 2024 ? "val" : "test";

      lines.push([
        row.annId, row.category, row.orgName, budgetRange(budget), row.region, subcat_main,
        month, year, weekday, season_q,
        Math.log(Math.max(1, budget)),
        row.numBidders ?? 0,
        row.stat_avg ?? 0, row.stat_stddev ?? 0, row.stat_sampleSize ?? 0,
        aValue > 0 ? Math.log(aValue + 1) : 0,
        budget > 0 ? aValue / budget : 0,
        row.aValueYn === "Y" ? 1 : 0,
        bsis > 0 ? Math.log(bsis) : 0,
        budget > 0 ? bsis / budget : 0,
        row.lwltRate ?? 0,
        org_past_mean, org_past_std, oa.cnt,
        cat_past_mean, cat_past_std, ca.cnt,
        winrate, split,
      ].map(csvEscape).join(","));
    }

    fs.writeFileSync(OUT_PATH, lines.join("\n"), "utf-8");
    console.log(`\n출력: ${OUT_PATH} (${lines.length - 1}건)`);
    console.log("\n다음 단계: cd apps/ml && python pipelines/train_lowerlimit_direct.py");
  } finally {
    await pool.end();
  }
})();
