/**
 * 재수집 [202103] vs 인접 정상 월 [202104] 비교
 *
 * 1. 컬럼별 NULL/EMPTY/0 비율
 * 2. 표본 5건씩 raw 출력
 * 3. 스키마 일치 여부 (information_schema)
 *
 * 실행: pnpm exec ts-node src/scripts/compare-recollect-vs-normal.ts
 */
import * as path from "path";
import * as fs from "fs";
(function loadEnv() {
  const candidates = [
    path.resolve(__dirname, "../../../web/.env.local"),
    path.resolve(__dirname, "../../../../.env"),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const c = fs.readFileSync(p, "utf-8");
    for (const l of c.split("\n")) {
      const t = l.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (!k) continue;
      if (v.includes("[YOUR-PASSWORD]") || v.includes("your-project")) continue;
      if (!process.env[k]) process.env[k] = v;
    }
  }
})();
import { Pool } from "pg";

const RECOLLECT_YM = "202103";
const NORMAL_YM = "202104";

const COLS = [
  "title", "orgName", "region", "category",
  "budget", "deadline", "sucsfbidLwltRate",
  "bsisAmt", "aValueTotal", "aValueYn", "aValueAmt", "aValueDetails",
  "subCategories",
  "ciblAplYn", "mtltyAdvcPsblYn",
  "jntcontrctDutyRgnNm1", "jntcontrctDutyRgnNm2", "jntcontrctDutyRgnNm3",
  "rgnDutyJntcontrctRt", "rgnDutyJntcontrctYn",
  "cnstrtsiteRgnNm", "bidQlfctRgstDt",
  "bidNtceDtlUrl", "ntceInsttOfclTelNo",
  "priceRangeRate", "rsrvtnPrceRngBgnRate", "rsrvtnPrceRngEndRate",
  "rawJson",
];

function isArrayCol(c: string) { return c === "subCategories"; }
function isJsonCol(c: string) { return c === "rawJson" || c === "aValueDetails"; }
function isNumericCol(c: string) {
  return ["budget", "sucsfbidLwltRate", "bsisAmt", "aValueTotal", "aValueAmt"].includes(c);
}
function isTimestampCol(c: string) {
  return ["deadline", "bidQlfctRgstDt"].includes(c);
}

function fillExpr(c: string): string {
  if (isArrayCol(c)) return `COALESCE(array_length("${c}",1),0) > 0`;
  if (isJsonCol(c)) return `"${c}" IS NOT NULL AND jsonb_typeof("${c}") IN ('object','array')`;
  if (isNumericCol(c)) return `"${c}" IS NOT NULL AND "${c}" > 0`;
  if (isTimestampCol(c)) return `"${c}" IS NOT NULL`;
  return `"${c}" IS NOT NULL AND "${c}" <> ''`;
}

async function fillRate(pool: Pool, ym: string, c: string): Promise<{ filled: number; total: number }> {
  const start = `${ym.slice(0, 4)}-${ym.slice(4, 6)}-01`;
  const y = parseInt(ym.slice(0, 4));
  const m = parseInt(ym.slice(4, 6));
  const end = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  const q = `
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE ${fillExpr(c)})::bigint AS filled
    FROM "Announcement"
    WHERE deadline >= $1::timestamptz AND deadline < $2::timestamptz
  `;
  const r = await pool.query(q, [start, end]);
  return { filled: Number(r.rows[0].filled), total: Number(r.rows[0].total) };
}

async function sample(pool: Pool, ym: string): Promise<any[]> {
  const start = `${ym.slice(0, 4)}-${ym.slice(4, 6)}-01`;
  const y = parseInt(ym.slice(0, 4));
  const m = parseInt(ym.slice(4, 6));
  const end = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  const q = `
    SELECT "konepsId", title, "orgName", region, category,
           budget::text AS budget, deadline,
           "sucsfbidLwltRate", "bsisAmt"::text AS bsisamt,
           "aValueTotal"::text AS avaluetotal,
           "subCategories", "ciblAplYn", "mtltyAdvcPsblYn",
           "jntcontrctDutyRgnNm1", "cnstrtsiteRgnNm",
           "bidNtceDtlUrl", "ntceInsttOfclTelNo",
           "priceRangeRate"
    FROM "Announcement"
    WHERE deadline >= $1::timestamptz AND deadline < $2::timestamptz
    ORDER BY "konepsId"
    LIMIT 5
  `;
  const r = await pool.query(q, [start, end]);
  return r.rows;
}

async function schemaCols(pool: Pool): Promise<string[]> {
  const r = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='Announcement'
    ORDER BY ordinal_position
  `);
  return r.rows.map((row: any) => row.column_name);
}

(async () => {
  const dbUrl = process.env.DATABASE_URL!;
  if (!dbUrl) { console.error("DATABASE_URL 없음"); process.exit(1); }
  const pool = new Pool({ connectionString: dbUrl, max: 1 });
  try {
    console.log(`=== Announcement 스키마 컬럼 (${(await schemaCols(pool)).length}개) ===`);
    const cols = await schemaCols(pool);
    console.log(cols.join(", "));

    console.log(`\n=== 채움율 비교: 재수집[${RECOLLECT_YM}] vs 정상[${NORMAL_YM}] ===`);
    console.log(`컬럼                       | ${RECOLLECT_YM} 채움% (filled/total) | ${NORMAL_YM} 채움% (filled/total) | 차이(p.p)`);
    console.log("-".repeat(120));
    const rows: { col: string; r: any; n: any; diff: number }[] = [];
    for (const c of COLS) {
      const r = await fillRate(pool, RECOLLECT_YM, c);
      const n = await fillRate(pool, NORMAL_YM, c);
      const rPct = r.total > 0 ? (r.filled / r.total) * 100 : 0;
      const nPct = n.total > 0 ? (n.filled / n.total) * 100 : 0;
      const diff = rPct - nPct;
      rows.push({ col: c, r, n, diff });
      console.log(
        `${c.padEnd(26)} | ${rPct.toFixed(2).padStart(6)}% (${String(r.filled).padStart(6)}/${String(r.total).padStart(6)}) | ${nPct.toFixed(2).padStart(6)}% (${String(n.filled).padStart(6)}/${String(n.total).padStart(6)}) | ${diff >= 0 ? "+" : ""}${diff.toFixed(1).padStart(5)}`,
      );
    }

    console.log(`\n=== ${RECOLLECT_YM} 표본 5건 ===`);
    const sR = await sample(pool, RECOLLECT_YM);
    for (const row of sR) {
      console.log(JSON.stringify(row, null, 2).slice(0, 1500));
      console.log("---");
    }
    console.log(`\n=== ${NORMAL_YM} 표본 5건 ===`);
    const sN = await sample(pool, NORMAL_YM);
    for (const row of sN) {
      console.log(JSON.stringify(row, null, 2).slice(0, 1500));
      console.log("---");
    }

    console.log(`\n=== 의심 컬럼 (재수집이 정상보다 5%p 이상 낮음) ===`);
    const susp = rows.filter((r) => r.diff < -5);
    if (susp.length === 0) console.log("  (없음 — 정상 월과 차이 5%p 이내)");
    else for (const s of susp) console.log(`  ${s.col}: ${s.diff.toFixed(1)}p 차이`);
  } finally {
    await pool.end();
  }
})().catch((e) => { console.error(e); process.exit(1); });
