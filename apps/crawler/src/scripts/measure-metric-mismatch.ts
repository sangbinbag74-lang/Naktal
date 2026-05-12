/**
 * 84% baseline 추정값을 실측치로 교체.
 * - DB Announcement 의 rawJson.bidNtceDt(공고일자) vs deadline(마감일자) 분포 분석
 * - 같은 deadline 월에 bidNtceDt 가 다른 월로 흘러나가는 비율 측정
 * - inqryDiv=1(공고일자) totalCount 와 DB deadline 카운트 사이의 자연 차이 산출
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

const rootEnv = path.resolve(__dirname, "../../../../.env");
const c = fs.readFileSync(rootEnv, "utf-8");
let url = "";
for (const l of c.split("\n")) {
  const t = l.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") url = v;
}

interface MonthRow {
  ym: string;
  total: number;          // deadline 기준 그 달 전체
  ntce_same_month: number; // bidNtceDt도 같은 달
  ntce_prev_month: number; // 직전 달
  ntce_older: number;      // 더 오래 (2개월+ 이전)
  ntce_future: number;     // 마감보다 미래의 공고일자 (이상치)
  ntce_null: number;       // rawJson에 bidNtceDt 없음
}

(async () => {
  const pool = new Pool({ connectionString: url });

  // 매칭률 높은 월(95%+) 샘플로 자연 mismatch 정밀 측정
  // verify-totalcount-result.json에서 95% 이상 월 추출
  const verify = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../../verify-totalcount-result.json"), "utf-8"));
  const HIGH_MATCH_MONTHS: string[] = verify.allMonths
    .filter((r: any) => r.ratio >= 95 && r.api > 0)
    .map((r: any) => r.ym);

  console.log(`매칭률 95%+ 월 ${HIGH_MATCH_MONTHS.length}개 샘플 분석:`);
  console.log(HIGH_MATCH_MONTHS.join(", "));

  const rows: MonthRow[] = [];

  for (const ym of HIGH_MATCH_MONTHS) {
    const [y, m] = ym.split("-").map((s) => parseInt(s));
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

    // bidNtceDt 추출: rawJson->>'bidNtceDt' 형식 "YYYY-MM-DD HH:MM:SS"
    const r = await pool.query(`
      WITH base AS (
        SELECT
          "rawJson"->>'bidNtceDt' AS ntce_dt,
          "deadline"
        FROM "Announcement"
        WHERE "deadline" >= $1::date AND "deadline" < $2::date
      )
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE ntce_dt IS NOT NULL AND ntce_dt != ''
            AND date_trunc('month', (ntce_dt)::timestamp) = date_trunc('month', deadline)
        )::int AS ntce_same_month,
        COUNT(*) FILTER (
          WHERE ntce_dt IS NOT NULL AND ntce_dt != ''
            AND date_trunc('month', (ntce_dt)::timestamp) = date_trunc('month', deadline) - INTERVAL '1 month'
        )::int AS ntce_prev_month,
        COUNT(*) FILTER (
          WHERE ntce_dt IS NOT NULL AND ntce_dt != ''
            AND date_trunc('month', (ntce_dt)::timestamp) < date_trunc('month', deadline) - INTERVAL '1 month'
        )::int AS ntce_older,
        COUNT(*) FILTER (
          WHERE ntce_dt IS NOT NULL AND ntce_dt != ''
            AND date_trunc('month', (ntce_dt)::timestamp) > date_trunc('month', deadline)
        )::int AS ntce_future,
        COUNT(*) FILTER (WHERE ntce_dt IS NULL OR ntce_dt = '')::int AS ntce_null
      FROM base
    `, [start, next]);

    const row: MonthRow = {
      ym,
      total: r.rows[0].total,
      ntce_same_month: r.rows[0].ntce_same_month,
      ntce_prev_month: r.rows[0].ntce_prev_month,
      ntce_older: r.rows[0].ntce_older,
      ntce_future: r.rows[0].ntce_future,
      ntce_null: r.rows[0].ntce_null,
    };
    rows.push(row);
    const sameMonthRate = ((row.ntce_same_month / row.total) * 100).toFixed(2);
    console.log(`  ${ym}: total=${row.total}, same_month=${row.ntce_same_month} (${sameMonthRate}%), prev=${row.ntce_prev_month}, older=${row.ntce_older}, future=${row.ntce_future}, null=${row.ntce_null}`);
  }

  // 자연 mismatch 비율 산출
  const totalAll = rows.reduce((s, r) => s + r.total, 0);
  const sameAll = rows.reduce((s, r) => s + r.ntce_same_month, 0);
  const prevAll = rows.reduce((s, r) => s + r.ntce_prev_month, 0);
  const olderAll = rows.reduce((s, r) => s + r.ntce_older, 0);
  const futureAll = rows.reduce((s, r) => s + r.ntce_future, 0);
  const nullAll = rows.reduce((s, r) => s + r.ntce_null, 0);

  console.log("\n=== 종합 (95%+ 매칭률 월 샘플) ===");
  console.log(`전체 deadline 기준 행 수: ${totalAll.toLocaleString()}`);
  console.log(`그 중 bidNtceDt 같은 달: ${sameAll.toLocaleString()} (${(sameAll/totalAll*100).toFixed(2)}%)`);
  console.log(`전월 공고: ${prevAll.toLocaleString()} (${(prevAll/totalAll*100).toFixed(2)}%)`);
  console.log(`2개월+ 이전 공고: ${olderAll.toLocaleString()} (${(olderAll/totalAll*100).toFixed(2)}%)`);
  console.log(`미래 공고 (이상): ${futureAll.toLocaleString()} (${(futureAll/totalAll*100).toFixed(2)}%)`);
  console.log(`bidNtceDt null: ${nullAll.toLocaleString()} (${(nullAll/totalAll*100).toFixed(2)}%)`);

  // 자연 mismatch = inqryDiv=1 (공고일자 기준) totalCount 가 그 달 deadline 카운트보다 많은 비율
  // = (전월 공고 + 2개월+ 이전 공고) 가 전월/그 이전 month의 deadline에 흘러간 양
  // = (이전 deadline의 inqryDiv=1 totalCount 에 흩어진 비율 = sameMonthRate 보수적 추정)
  const sameMonthRate = sameAll / totalAll;
  console.log(`\n실측 자연 mismatch baseline = ${(sameMonthRate*100).toFixed(2)}%`);
  console.log(`(이전 84% 추정값과의 차이: ${((sameMonthRate - 0.84)*100).toFixed(2)}%p)`);

  // 진짜 누락량 재계산
  const allMonths = verify.allMonths as Array<{ym: string; api: number; db: number; ratio: number}>;
  const totalApi = allMonths.reduce((s, r) => s + r.api, 0);
  const totalDb = allMonths.reduce((s, r) => s + r.db, 0);
  const expectedDb = Math.round(totalApi * sameMonthRate);
  const realMissing = Math.max(0, expectedDb - totalDb);
  console.log(`\n=== 진짜 누락량 재계산 ===`);
  console.log(`전체 G2B api 합: ${totalApi.toLocaleString()}`);
  console.log(`전체 DB 합: ${totalDb.toLocaleString()}`);
  console.log(`기대 DB (실측 baseline ${(sameMonthRate*100).toFixed(2)}% 적용): ${expectedDb.toLocaleString()}`);
  console.log(`실측 누락량: ${realMissing.toLocaleString()}건`);
  console.log(`(이전 84% 추정 1,051,365건과의 차이: ${(realMissing - 1051365).toLocaleString()}건)`);

  // 월별 진짜 누락량 산출
  const realPerMonth = allMonths.map(r => {
    const exp = Math.round(r.api * sameMonthRate);
    return { ...r, expected: exp, missing: Math.max(0, exp - r.db) };
  });
  const incompleteReal = realPerMonth.filter(r => r.missing > 0 && r.api > 0).sort((a,b) => b.missing - a.missing);
  console.log(`\n실측 baseline 적용 시 누락 월 수: ${incompleteReal.length}`);
  console.log(`Top 20 (누락량 큰 순):`);
  for (const r of incompleteReal.slice(0, 20)) {
    console.log(`  ${r.ym}: api=${r.api} db=${r.db} expected=${r.expected} missing=${r.missing}`);
  }

  const out = path.resolve(__dirname, "../../../../measure-metric-mismatch-result.json");
  fs.writeFileSync(out, JSON.stringify({
    generatedAt: new Date().toISOString(),
    sampleMonths: HIGH_MATCH_MONTHS,
    naturalBaseline: sameMonthRate,
    sampleStats: {
      totalAll, sameAll, prevAll, olderAll, futureAll, nullAll,
    },
    realMissing,
    realPerMonthIncomplete: incompleteReal,
  }, null, 2));
  console.log(`\nJSON 저장: ${out}`);

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
