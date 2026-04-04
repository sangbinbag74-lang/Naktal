/**
 * SajungRateStat 전면 재수집 (SQL 직접 집계 — API 페이징 불필요)
 * BidResult × Announcement JOIN → 사정율 계산 → upsert
 *
 * 실행: node rebuild-sajung-stat.js
 */
const { Pool } = require("pg");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs"), path = require("path");
const crypto = require("crypto");

function loadEnv() {
  const envPath = path.resolve(__dirname, "../../.env");
  if (!fs.existsSync(envPath)) return {};
  const result = {};
  for (let line of fs.readFileSync(envPath, "utf8").split("\n")) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    let k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    result[k] = v.trim();
  }
  return result;
}

const ENV = loadEnv();
const pool = new Pool({ connectionString: ENV.DIRECT_URL, max: 1 });
const supabase = createClient(ENV.NEXT_PUBLIC_SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function statKey(orgName, category, budgetRange, region) {
  const h = crypto.createHash("md5").update(`${orgName}|${category}|${budgetRange}|${region}`).digest("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
}

function classifyBudget(budget) {
  if (budget < 100_000_000)   return "1억미만";
  if (budget < 300_000_000)   return "1억-3억";
  if (budget < 1_000_000_000) return "3억-10억";
  if (budget < 3_000_000_000) return "10억-30억";
  return "30억이상";
}

function percentile(sorted, p) {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function calcMode(values) {
  const counts = {};
  for (const v of values) {
    const key = (Math.round(v * 10) / 10).toFixed(1);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  let maxKey = "98.5", maxCnt = 0;
  for (const [k, c] of Object.entries(counts)) {
    if (c > maxCnt) { maxCnt = c; maxKey = k; }
  }
  return parseFloat(maxKey);
}

function calcStats(rates, months) {
  const n = rates.length;
  const avg = rates.reduce((s, v) => s + v, 0) / n;
  const variance = rates.reduce((s, v) => s + (v - avg) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  const sorted = [...rates].sort((a, b) => a - b);
  const monthMap = {};
  for (let i = 0; i < n; i++) {
    const m = String(months[i]);
    if (!monthMap[m]) monthMap[m] = [];
    monthMap[m].push(rates[i]);
  }
  const monthlyAvg = {};
  for (const [m, arr] of Object.entries(monthMap)) {
    monthlyAvg[m] = Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 100) / 100;
  }
  return {
    avg: Math.round(avg * 100) / 100,
    stddev: Math.round(stddev * 100) / 100,
    p25: Math.round(percentile(sorted, 25) * 100) / 100,
    p50: Math.round(percentile(sorted, 50) * 100) / 100,
    p75: Math.round(percentile(sorted, 75) * 100) / 100,
    min: Math.round(sorted[0] * 100) / 100,
    max: Math.round(sorted[n - 1] * 100) / 100,
    mode: calcMode(rates),
    monthlyAvg,
    sampleSize: n,
  };
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = 0");

    console.log("=== BidResult × Announcement 사정율 집계 (SQL 직접) ===");
    console.log("조회 중...");

    // DB에서 직접 사정율 계산 가능한 모든 레코드 조회
    const { rows } = await client.query(`
      SELECT
        a."orgName",
        a.category,
        a.region,
        a.budget::float AS budget,
        EXTRACT(MONTH FROM a.deadline)::int AS month,
        b."finalPrice"::float AS "finalPrice",
        b."bidRate"::float AS "bidRate",
        -- 사정율 계산: 예정가 ÷ 기초금액 × 100
        -- 예정가 = 낙찰금액 ÷ (낙찰률 ÷ 100)
        (b."finalPrice"::float / (b."bidRate"::float / 100.0)) / a.budget::float * 100.0 AS "sajungRate"
      FROM "BidResult" b
      JOIN "Announcement" a ON a."konepsId" = b."annId"
      WHERE
        b."bidRate" IS NOT NULL
        AND b."finalPrice" IS NOT NULL
        AND a.budget IS NOT NULL
        AND b."bidRate"::float > 50
        AND b."bidRate"::float < 110
        AND a.budget::float > 0
        -- 사정율 유효 범위: 물품/용역(97~103%), 공사(105~120%) 포괄
        AND (b."finalPrice"::float / (b."bidRate"::float / 100.0)) / a.budget::float * 100.0 BETWEEN 85 AND 125
        AND a.category IS NOT NULL
        AND a.category != ''
    `);

    console.log(`유효 데이터: ${rows.length}건`);

    // JS에서 그룹핑 + 통계 계산
    const groups = new Map();
    for (const row of rows) {
      const budgetRange = classifyBudget(row.budget);
      const key = `${row.orgName}|${row.category}|${budgetRange}|${row.region ?? ""}`;
      if (!groups.has(key)) groups.set(key, { rates: [], months: [] });
      groups.get(key).rates.push(row.sajungRate);
      groups.get(key).months.push(row.month);
    }

    console.log(`그룹 수: ${groups.size}`);

    // 발주처별 통계 레코드 생성
    const records = [];
    for (const [key, gdata] of groups) {
      if (gdata.rates.length < 3) continue;
      const [orgName, category, budgetRange, region] = key.split("|");
      const stats = calcStats(gdata.rates, gdata.months);
      records.push({ id: statKey(orgName, category, budgetRange, region), orgName, category, budgetRange, region, updatedAt: new Date().toISOString(), ...stats });
    }

    // ALL orgName (카테고리+예산+지역별 전체 평균) 생성
    const allGroups = new Map();
    for (const [key, gdata] of groups) {
      const parts = key.split("|");
      const catKey = `ALL|${parts[1]}|${parts[2]}|${parts[3]}`;
      if (!allGroups.has(catKey)) allGroups.set(catKey, { rates: [], months: [] });
      allGroups.get(catKey).rates.push(...gdata.rates);
      allGroups.get(catKey).months.push(...gdata.months);
    }
    for (const [key, gdata] of allGroups) {
      if (gdata.rates.length < 5) continue;
      const [orgName, category, budgetRange, region] = key.split("|");
      const stats = calcStats(gdata.rates, gdata.months);
      records.push({ id: statKey(orgName, category, budgetRange, region), orgName, category, budgetRange, region, updatedAt: new Date().toISOString(), ...stats });
    }

    console.log(`총 ${records.length}개 레코드 upsert 예정`);

    // 카테고리 분포 미리보기
    const catDist = {};
    for (const r of records) { catDist[r.category] = (catDist[r.category] ?? 0) + 1; }
    const top10 = Object.entries(catDist).sort((a, b) => b[1] - a[1]).slice(0, 10);
    console.log("카테고리 분포 top10:", top10.map(([c, n]) => `${c}(${n})`).join(", "));

    // Supabase upsert (500건씩)
    const BATCH = 500;
    let upserted = 0;
    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      const { error } = await supabase
        .from("SajungRateStat")
        .upsert(batch, { onConflict: "orgName,category,budgetRange,region" });
      if (error) {
        console.error(`배치 upsert 오류 (${i}~):`, error.message);
      } else {
        upserted += batch.length;
        process.stdout.write(`\r  ${upserted} / ${records.length} upsert 완료`);
      }
    }
    console.log(`\n=== 완료: ${upserted}개 SajungRateStat 저장 ===`);

    // 결과 확인
    const r = await client.query(`
      SELECT category, COUNT(*) AS rows, SUM("sampleSize") AS samples
      FROM "SajungRateStat" GROUP BY category ORDER BY samples::int DESC LIMIT 15
    `);
    console.log("\n최종 category 분포:");
    for (const row of r.rows) {
      console.log(`  ${row.category}: ${row.rows}행, ${row.samples}건`);
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
