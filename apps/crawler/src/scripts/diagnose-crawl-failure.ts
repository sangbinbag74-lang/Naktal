/**
 * 크롤링 실패 원인 실측 분석 (DB 읽기 전용, API/UPSERT 0회)
 *
 * 측정 항목:
 * 1. CrawlLog ANNOUNCEMENT 타입 status/errors 분포 — 과거 실패 흔적
 * 2. Announcement.createdAt 분포 — 누락 월의 데이터가 언제 수집되었는지
 * 3. 누락 월(<79.48% baseline)의 createdAt 패턴 vs 정상 월 비교
 * 4. CrawlLog 일별 호출 카운트 — 일일 100K 한도 도달 흔적
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

  // ─── 1. CrawlLog 테이블 존재 + 컬럼 확인 ──────────────────────
  console.log("=== 1. CrawlLog 스키마 ===");
  const cols = await pool.query<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'CrawlLog' ORDER BY ordinal_position`,
  );
  cols.rows.forEach((r) => console.log(`  ${r.column_name}: ${r.data_type}`));

  // ─── 1.5 enum 실측 ────────────────────────────────────────────
  console.log("\n=== 1.5 enum 실값 ===");
  const eStatus = await pool.query<{ v: string }>(`SELECT unnest(enum_range(NULL::"CrawlStatus"))::text AS v`);
  const eType   = await pool.query<{ v: string }>(`SELECT unnest(enum_range(NULL::"CrawlType"))::text AS v`);
  console.log("  CrawlStatus:", eStatus.rows.map((r) => r.v).join(", "));
  console.log("  CrawlType  :", eType.rows.map((r) => r.v).join(", "));
  const failureValues = eStatus.rows.map((r) => r.v).filter((v) => /fail|error|err|abort|timeout|partial/i.test(v));
  console.log("  → 실패로 간주할 status:", failureValues.length ? failureValues.join(", ") : "(없음)");

  // ─── 2. CrawlLog type/status 분포 ─────────────────────────────
  console.log("\n=== 2. CrawlLog type/status 분포 ===");
  const dist = await pool.query<{ type: string; status: string; cnt: string }>(
    `SELECT "type"::text AS type, "status"::text AS status, COUNT(*)::text AS cnt
     FROM "CrawlLog"
     GROUP BY "type", "status"
     ORDER BY "type", "status"`,
  );
  console.log("type                | status   | count");
  console.log("--------------------|----------|-------");
  dist.rows.forEach((r) =>
    console.log(`${r.type.padEnd(20)} | ${r.status.padEnd(8)} | ${r.cnt}`),
  );

  // ─── 3. 실패 errors 샘플 (최근 30개) ───────────────────────────
  console.log("\n=== 3. 최근 ANNOUNCEMENT 실패류 errors 샘플 ===");
  const failClause = failureValues.length
    ? `"status"::text IN (${failureValues.map((v) => `'${v}'`).join(",")})`
    : `"status"::text != 'SUCCESS'`;
  const fails = await pool.query<{ createdAt: string; status: string; errors: string; count: number }>(
    `SELECT "createdAt", "status"::text AS status, errors, count
     FROM "CrawlLog"
     WHERE "type"::text = 'ANNOUNCEMENT' AND ${failClause}
     ORDER BY "createdAt" DESC LIMIT 30`,
  );
  fails.rows.forEach((r) => {
    const err = (r.errors ?? "").slice(0, 150).replace(/\n/g, " ");
    console.log(`  ${r.createdAt.toString().slice(0, 19)} | ${r.status.padEnd(8)} | cnt=${r.count} | ${err}`);
  });

  // ─── 4. CrawlLog 일별 호출 카운트 (최근 60일) ──────────────────
  console.log("\n=== 4. CrawlLog 일별 ANNOUNCEMENT 호출 카운트 (최근 60일) ===");
  const daily = await pool.query<{ d: string; total: string; success: string; fail: string; n: string }>(
    `SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS d,
            COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE "status"::text = 'SUCCESS')::text AS success,
            COUNT(*) FILTER (WHERE "status"::text IN ('PARTIAL','FAILED'))::text AS fail,
            COALESCE(SUM("count"), 0)::text AS n
     FROM "CrawlLog"
     WHERE "type"::text = 'ANNOUNCEMENT' AND "createdAt" > NOW() - INTERVAL '60 days'
     GROUP BY 1 ORDER BY 1 DESC LIMIT 60`,
  );
  console.log("일자       | total | success | fail | rows");
  console.log("-----------|-------|---------|------|------");
  daily.rows.forEach((r) =>
    console.log(`${r.d} | ${String(r.total).padStart(5)} | ${String(r.success).padStart(7)} | ${String(r.fail).padStart(4)} | ${String(r.n).padStart(6)}`),
  );

  // ─── 5. Announcement.createdAt — 누락 월 데이터가 언제 들어왔는지 ─
  console.log("\n=== 5. 누락 worst 월 7개의 createdAt 분포 ===");
  const WORST = ["2021-03", "2020-12", "2014-03", "2015-03", "2022-02", "2021-11", "2007-03"];
  for (const ym of WORST) {
    const [y, m] = ym.split("-").map((s) => parseInt(s));
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const r = await pool.query<{ d: string; cnt: string }>(
      `SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS d,
              COUNT(*)::text AS cnt
       FROM "Announcement"
       WHERE "deadline" >= $1::date AND "deadline" < $2::date
       GROUP BY 1 ORDER BY 1`,
      [start, next],
    );
    const dataDays = r.rows.length;
    const totalRows = r.rows.reduce((s, x) => s + parseInt(x.cnt), 0);
    const earliest = r.rows[0]?.d ?? "—";
    const latest = r.rows[r.rows.length - 1]?.d ?? "—";
    console.log(`  ${ym}: ${totalRows}건 / ${dataDays}일에 분산 / ${earliest} ~ ${latest}`);
    // 가장 많이 들어온 날 top 3
    const top = r.rows.slice().sort((a, b) => parseInt(b.cnt) - parseInt(a.cnt)).slice(0, 3);
    top.forEach((t) => console.log(`     - ${t.d}: ${t.cnt}건`));
  }

  // ─── 6. 정상 월 vs 누락 월 — 데이터 들어온 날짜 수 비교 ─
  console.log("\n=== 6. 정상 월(2024-12) vs 누락 월(2021-03) createdAt 분포 ===");
  for (const ym of ["2024-12", "2021-03"]) {
    const [y, m] = ym.split("-").map((s) => parseInt(s));
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const r = await pool.query<{ d: string; cnt: string }>(
      `SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS d,
              COUNT(*)::text AS cnt
       FROM "Announcement"
       WHERE "deadline" >= $1::date AND "deadline" < $2::date
       GROUP BY 1 ORDER BY 1`,
      [start, next],
    );
    console.log(`\n  --- ${ym} (총 ${r.rows.reduce((s,x)=>s+parseInt(x.cnt),0)}건, ${r.rows.length}일) ---`);
    // 가장 큰 날 top 5
    const top = r.rows.slice().sort((a, b) => parseInt(b.cnt) - parseInt(a.cnt)).slice(0, 8);
    top.forEach((t) => console.log(`     ${t.d}: ${t.cnt}건`));
  }

  // ─── 7. 가장 많이 데이터 들어온 단일 일 (전 시기) ─────────────
  console.log("\n=== 7. Announcement createdAt 일별 row 수 top 30 ===");
  const heaviest = await pool.query<{ d: string; cnt: string }>(
    `SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS d,
            COUNT(*)::text AS cnt
     FROM "Announcement"
     GROUP BY 1
     ORDER BY 2 DESC LIMIT 30`,
  );
  console.log("일자       | 일일 INSERT row 수");
  console.log("-----------|------------------");
  heaviest.rows.forEach((r) =>
    console.log(`${r.d} | ${String(r.cnt).padStart(8)}`),
  );

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
