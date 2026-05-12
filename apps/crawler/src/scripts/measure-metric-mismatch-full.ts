/**
 * 자연 mismatch baseline 정밀화: 95%+ 9개월에서 full 292개월로 확장
 * - 12월 편향 제거 (계절성)
 * - 모든 deadline 월에서 bidNtceDt 분포 분석
 * - 가중 평균 baseline 산출
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

(async () => {
  const pool = new Pool({ connectionString: url });

  // 단일 쿼리로 전체 추출 (월별 group by)
  const r = await pool.query(`
    WITH base AS (
      SELECT
        date_trunc('month', deadline) AS dl_month,
        date_trunc('month', NULLIF("rawJson"->>'bidNtceDt','')::timestamp) AS ntce_month
      FROM "Announcement"
      WHERE "deadline" IS NOT NULL
    )
    SELECT
      to_char(dl_month, 'YYYY-MM') AS ym,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE ntce_month = dl_month)::int AS same_month,
      COUNT(*) FILTER (WHERE ntce_month = dl_month - INTERVAL '1 month')::int AS prev_month,
      COUNT(*) FILTER (WHERE ntce_month < dl_month - INTERVAL '1 month')::int AS older,
      COUNT(*) FILTER (WHERE ntce_month > dl_month)::int AS future,
      COUNT(*) FILTER (WHERE ntce_month IS NULL)::int AS nul
    FROM base
    GROUP BY dl_month
    ORDER BY dl_month
  `);

  const rows = r.rows as Array<{ym: string; total: number; same_month: number; prev_month: number; older: number; future: number; nul: number}>;

  let totalAll = 0, sameAll = 0, prevAll = 0, olderAll = 0, futureAll = 0, nullAll = 0;
  for (const x of rows) {
    totalAll += x.total;
    sameAll += x.same_month;
    prevAll += x.prev_month;
    olderAll += x.older;
    futureAll += x.future;
    nullAll += x.nul;
  }

  console.log(`=== 전 292개월 전수 분석 (deadline 기준 ${rows.length}개월) ===`);
  console.log(`전체 row: ${totalAll.toLocaleString()}`);
  console.log(`bidNtceDt 같은 달: ${sameAll.toLocaleString()} (${(sameAll/totalAll*100).toFixed(2)}%)`);
  console.log(`전월 공고: ${prevAll.toLocaleString()} (${(prevAll/totalAll*100).toFixed(2)}%)`);
  console.log(`2개월+ 이전: ${olderAll.toLocaleString()} (${(olderAll/totalAll*100).toFixed(2)}%)`);
  console.log(`미래 공고: ${futureAll.toLocaleString()} (${(futureAll/totalAll*100).toFixed(2)}%)`);
  console.log(`bidNtceDt null: ${nullAll.toLocaleString()} (${(nullAll/totalAll*100).toFixed(2)}%)`);

  const fullBaseline = sameAll / totalAll;
  console.log(`\n실측 baseline (전수, 가중 평균): ${(fullBaseline*100).toFixed(2)}%`);

  // 월별 same_month 비율 분포
  const monthlyRates = rows.map(x => ({ ym: x.ym, rate: x.same_month / x.total })).filter(x => isFinite(x.rate));
  const sortedRates = monthlyRates.slice().sort((a,b) => a.rate - b.rate);
  const median = sortedRates[Math.floor(sortedRates.length/2)]?.rate ?? 0;
  const min = sortedRates[0]?.rate ?? 0;
  const max = sortedRates[sortedRates.length-1]?.rate ?? 0;

  console.log(`월별 baseline 분포: min=${(min*100).toFixed(2)}% / median=${(median*100).toFixed(2)}% / max=${(max*100).toFixed(2)}%`);
  console.log(`최저 5개월:`);
  sortedRates.slice(0,5).forEach(x => console.log(`  ${x.ym}: ${(x.rate*100).toFixed(2)}%`));
  console.log(`최고 5개월:`);
  sortedRates.slice(-5).forEach(x => console.log(`  ${x.ym}: ${(x.rate*100).toFixed(2)}%`));

  // 진짜 누락량 재계산 (full baseline)
  const verify = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../../verify-totalcount-result.json"), "utf-8"));
  const allMonths = verify.allMonths as Array<{ym: string; api: number; db: number; ratio: number}>;
  const totalApi = allMonths.reduce((s, r) => s + r.api, 0);
  const totalDb = allMonths.reduce((s, r) => s + r.db, 0);
  const expectedDb = Math.round(totalApi * fullBaseline);
  const realMissing = Math.max(0, expectedDb - totalDb);
  console.log(`\n=== 진짜 누락량 재계산 (full baseline ${(fullBaseline*100).toFixed(2)}%) ===`);
  console.log(`전체 G2B api: ${totalApi.toLocaleString()}`);
  console.log(`전체 DB: ${totalDb.toLocaleString()}`);
  console.log(`기대 DB: ${expectedDb.toLocaleString()}`);
  console.log(`실측 누락: ${realMissing.toLocaleString()}건`);

  // 월별 진짜 누락
  const realPerMonth = allMonths.map(r => {
    const exp = Math.round(r.api * fullBaseline);
    return { ...r, expected: exp, missing: Math.max(0, exp - r.db) };
  });
  const incomplete = realPerMonth.filter(r => r.missing > 0 && r.api > 0).sort((a,b) => b.missing - a.missing);
  console.log(`누락 월 수: ${incomplete.length}`);

  const out = path.resolve(__dirname, "../../../../measure-metric-mismatch-full.json");
  fs.writeFileSync(out, JSON.stringify({
    generatedAt: new Date().toISOString(),
    fullBaseline,
    samples12Dec: 0.7835,
    sampleStats: { totalAll, sameAll, prevAll, olderAll, futureAll, nullAll },
    monthlyRates: rows,
    realMissing,
    incompleteCount: incomplete.length,
    incomplete,
  }, null, 2));
  console.log(`\nJSON 저장: ${out}`);

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
