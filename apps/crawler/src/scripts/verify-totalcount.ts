/**
 * G2B API totalCount vs DB 월별 카운트 비교 (재수집 없음, 진단만)
 * - 의심 월에 대해 inqryDiv=1, numOfRows=1, pageNo=1 호출
 * - 응답 첫 줄 totalCount만 확인
 * - DB deadline 기준 같은 달 카운트와 비교 → 실제 누락 vs G2B 원본 부족 판별
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

const rootEnv = path.resolve(__dirname, "../../../../.env");
const c = fs.readFileSync(rootEnv, "utf-8");
let url = "";
let apiKey = "";
for (const l of c.split("\n")) {
  const t = l.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") url = v;
  if (k === "KONEPS_API_KEY" || (k === "G2B_API_KEY" && !apiKey)) apiKey = v;
}

const BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";
const OPS = ["getBidPblancListInfoCnstwk", "getBidPblancListInfoServc", "getBidPblancListInfoThng"] as const;

// 전수 검증: 2002-01 ~ 2026-04 (현재까지)
const SUSPECT_MONTHS: string[] = [];
{
  let y = 2002, m = 1;
  while (y < 2026 || (y === 2026 && m <= 4)) {
    SUSPECT_MONTHS.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
}

function lastDay(ym: string): string {
  const [y, m] = ym.split("-").map((s) => parseInt(s));
  const d = new Date(y, m, 0).getDate();
  return `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
}

async function getTotalCount(op: string, ym: string): Promise<number> {
  const [y, m] = ym.split("-");
  const from = `${y}${m}010000`;
  const to = `${lastDay(ym)}2359`;
  const u = `${BASE}/${op}?serviceKey=${encodeURIComponent(apiKey)}&inqryDiv=1&inqryBgnDt=${from}&inqryEndDt=${to}&numOfRows=1&pageNo=1&type=json`;
  const r = await fetch(u);
  if (!r.ok) {
    console.error(`  [${op}] HTTP ${r.status}`);
    return -1;
  }
  const text = await r.text();
  try {
    const j = JSON.parse(text);
    const tc = j?.response?.body?.totalCount;
    return typeof tc === "number" ? tc : parseInt(String(tc ?? "0"), 10);
  } catch {
    console.error(`  [${op}] parse fail: ${text.slice(0, 200)}`);
    return -1;
  }
}

interface Row { ym: string; api: number; db: number; ratio: number; }

(async () => {
  const pool = new Pool({ connectionString: url });
  const rows: Row[] = [];
  const total = SUSPECT_MONTHS.length;

  for (let i = 0; i < total; i++) {
    const ym = SUSPECT_MONTHS[i];
    const counts = await Promise.all(OPS.map((op) => getTotalCount(op, ym)));
    const api = counts.reduce((a, b) => a + Math.max(0, b), 0);

    const [y, m] = ym.split("-").map((s) => parseInt(s));
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const dbR = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM "Announcement" WHERE "deadline" >= $1::date AND "deadline" < $2::date`,
      [start, next],
    );
    const db = parseInt(dbR.rows[0]?.cnt ?? "0");
    const ratio = api > 0 ? (db / api) * 100 : 0;
    rows.push({ ym, api, db, ratio });

    if ((i + 1) % 24 === 0) {
      process.stderr.write(`  ${i + 1}/${total} (${ym}) 진행\n`);
    }
  }

  // 정상 baseline = 84% 매칭. 80% 미만은 누락 의심
  const incomplete = rows.filter((r) => r.ratio < 80 && r.api > 0);
  const totalApi = rows.reduce((s, r) => s + r.api, 0);
  const totalDb  = rows.reduce((s, r) => s + r.db, 0);
  const incApi   = incomplete.reduce((s, r) => s + r.api, 0);
  const incDb    = incomplete.reduce((s, r) => s + r.db, 0);
  const expected = incApi * 0.84;
  const missing  = Math.max(0, Math.round(expected - incDb));

  console.log("=== 전체 월 검증 (2002-01 ~ 2026-04, 292개월) ===");
  console.log(`전체 G2B 합:   ${totalApi.toLocaleString()}`);
  console.log(`전체 DB 합:    ${totalDb.toLocaleString()} (${(totalDb / totalApi * 100).toFixed(1)}%)`);
  console.log(`정상 월 수:    ${rows.length - incomplete.length}`);
  console.log(`미완료 월 수:  ${incomplete.length}`);
  console.log(`미완료 누락 추정: ${missing.toLocaleString()}건 (84% baseline 적용)\n`);

  console.log("=== 미완료 월 목록 (매칭 < 80%) ===");
  console.log("월       | G2B     | DB      | 매칭   | 누락추정");
  console.log("---------|---------|---------|--------|--------");
  for (const r of incomplete) {
    const exp = Math.round(r.api * 0.84);
    const miss = Math.max(0, exp - r.db);
    console.log(
      `${r.ym} | ${String(r.api).padStart(7)} | ${String(r.db).padStart(7)} | ${r.ratio.toFixed(1).padStart(5)}% | ${String(miss).padStart(7)}`,
    );
  }

  // JSON 저장 (plan에 첨부 가능)
  const outPath = path.resolve(__dirname, "../../../../verify-totalcount-result.json");
  fs.writeFileSync(outPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    summary: {
      totalApi, totalDb,
      matchRate: totalDb / totalApi,
      incompleteCount: incomplete.length,
      missingEstimate: missing,
    },
    incomplete: incomplete.map((r) => ({ ...r, expected: Math.round(r.api * 0.84), missing: Math.max(0, Math.round(r.api * 0.84) - r.db) })),
    allMonths: rows,
  }, null, 2));
  console.log(`\nJSON 저장: ${outPath}`);

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
