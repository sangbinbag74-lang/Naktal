/**
 * 미완료 월 Announcement 재수집 + 매월 끝 검증
 *
 * 입력: naktal/verify-totalcount-result.json (incomplete 배열)
 * 동작:
 *  1) incomplete 월을 missing ASC (작은 누락 먼저) 정렬
 *  2) 각 월:
 *     a. before = DB deadline-range count
 *     b. fetchAnnouncements (3 op × paginate, numOfRows=999, maxPages=999)
 *     c. upsertAnnouncementBatch (idempotent ON CONFLICT)
 *     d. after = DB count
 *     e. G2B totalCount 재호출 (3 op 합)
 *     f. 표본 5건 SELECT (budget>0, deadline 유효, title != "")
 *     g. ratio < 80% & before < after 면 1회 재시도
 *     h. stdout 1줄: [YM] before→after | G2B=K | 채움=X% | 표본=OK|FAIL
 *
 * 실행: pnpm ts-node src/scripts/refill-incomplete-anns.ts [--from YYYY-MM] [--to YYYY-MM] [--limit N]
 */
import * as path from "path";
import * as fs from "fs";

// bulk-import.ts와 동일한 패턴: apps/web/.env.local 우선, 그 다음 루트 .env
function loadEnv(): void {
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
}
loadEnv();

import { Pool } from "pg";
import { fetchAnnouncements } from "../fetchers/g2b-announcement";
import { upsertAnnouncementBatch } from "../db/upsert";

interface IncompleteEntry {
  ym: string;
  api: number;
  db: number;
  ratio: number;
  expected: number;
  missing: number;
}

const BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";
const OPS = ["getBidPblancListInfoCnstwk", "getBidPblancListInfoServc", "getBidPblancListInfoThng"] as const;

function parseArgs(): { from?: string; to?: string; limit?: number } {
  const args = process.argv.slice(2);
  const out: { from?: string; to?: string; limit?: number } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--from" && args[i + 1]) out.from = args[i + 1];
    if (args[i] === "--to"   && args[i + 1]) out.to   = args[i + 1];
    if (args[i] === "--limit" && args[i + 1]) out.limit = parseInt(args[i + 1], 10);
  }
  return out;
}

function lastDay(ym: string): string {
  const [y, m] = ym.split("-").map((s) => parseInt(s));
  const d = new Date(y, m, 0).getDate();
  return `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
}

function ymRangeDates(ym: string): { fromDate: string; toDate: string; start: string; nextStart: string } {
  const [y, m] = ym.split("-").map((s) => parseInt(s));
  const fromDate = `${y}${String(m).padStart(2, "0")}01`;
  const toDate = lastDay(ym);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const nextStart = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { fromDate, toDate, start, nextStart };
}

async function getG2BTotalCount(ym: string): Promise<number> {
  const apiKey = process.env.G2B_API_KEY || process.env.KONEPS_API_KEY || "";
  if (!apiKey) throw new Error("G2B_API_KEY 미설정");
  const [y, m] = ym.split("-");
  const from = `${y}${m}010000`;
  const to = `${lastDay(ym)}2359`;
  let total = 0;
  for (const op of OPS) {
    const u = `${BASE}/${op}?serviceKey=${encodeURIComponent(apiKey)}&inqryDiv=1&inqryBgnDt=${from}&inqryEndDt=${to}&numOfRows=1&pageNo=1&type=json`;
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(30_000) });
      if (!r.ok) continue;
      const j: any = await r.json();
      const tc = j?.response?.body?.totalCount;
      const n = typeof tc === "number" ? tc : parseInt(String(tc ?? "0"), 10);
      if (Number.isFinite(n) && n > 0) total += n;
    } catch { /* skip */ }
  }
  return total;
}

async function dbCount(pool: Pool, ym: string): Promise<number> {
  const { start, nextStart } = ymRangeDates(ym);
  const r = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM "Announcement" WHERE "deadline" >= $1::date AND "deadline" < $2::date`,
    [start, nextStart],
  );
  return parseInt(r.rows[0]?.cnt ?? "0", 10);
}

async function dbSample(pool: Pool, ym: string): Promise<{ ok: boolean; reason: string }> {
  const { start, nextStart } = ymRangeDates(ym);
  const r = await pool.query<{ title: string; budget: string; deadline: string; konepsId: string }>(
    `SELECT title, budget::text AS budget, "deadline"::text AS deadline, "konepsId"
     FROM "Announcement" WHERE "deadline" >= $1::date AND "deadline" < $2::date
     ORDER BY random() LIMIT 5`,
    [start, nextStart],
  );
  if (r.rows.length === 0) return { ok: false, reason: "샘플 없음" };
  for (const row of r.rows) {
    if (!row.title || row.title.trim() === "") return { ok: false, reason: `title 빈값 (${row.konepsId})` };
    if (!row.budget || row.budget === "0") return { ok: false, reason: `budget=0 (${row.konepsId})` };
    if (!row.deadline) return { ok: false, reason: `deadline null (${row.konepsId})` };
  }
  return { ok: true, reason: `5건 OK` };
}

async function refillMonth(pool: Pool, e: IncompleteEntry): Promise<{ ok: boolean; before: number; after: number; api: number; ratio: number; sample: string }> {
  const { fromDate, toDate } = ymRangeDates(e.ym);
  const before = await dbCount(pool, e.ym);

  let attempt = 0;
  let after = before;
  let api = 0;
  let ratio = 0;
  let sample = "";

  while (attempt < 2) {
    attempt++;
    try {
      const rows = await fetchAnnouncements({ fromDate, toDate, numOfRows: 999, maxPages: 999 });
      try { await upsertAnnouncementBatch(rows); } catch (e2) {
        process.stderr.write(`  [${e.ym}] 배치 저장 실패: ${(e2 as Error).message.slice(0, 200)}\n`);
      }
    } catch (err) {
      process.stderr.write(`  [${e.ym}] 수집 throw: ${(err as Error).message.slice(0, 200)}\n`);
    }

    after = await dbCount(pool, e.ym);
    api = await getG2BTotalCount(e.ym);
    ratio = api > 0 ? (after / api) * 100 : 0;

    if (ratio >= 80) break;
    if (attempt < 2) {
      process.stderr.write(`  [${e.ym}] 채움 ${ratio.toFixed(1)}% — 재시도\n`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  const s = await dbSample(pool, e.ym);
  sample = s.ok ? "OK" : `FAIL(${s.reason})`;
  const ok = ratio >= 80 && s.ok;
  return { ok, before, after, api, ratio, sample };
}

(async () => {
  const args = parseArgs();
  const jsonPath = path.resolve(__dirname, "../../../../verify-totalcount-result.json");
  if (!fs.existsSync(jsonPath)) throw new Error(`JSON 없음: ${jsonPath}`);
  const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as { incomplete: IncompleteEntry[] };

  let list = [...data.incomplete];
  if (args.from) list = list.filter((e) => e.ym >= args.from!);
  if (args.to)   list = list.filter((e) => e.ym <= args.to!);
  list.sort((a, b) => a.missing - b.missing); // 작은 누락 먼저
  if (args.limit) list = list.slice(0, args.limit);

  const total = list.length;
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL 미설정");
  const pool = new Pool({ connectionString: dbUrl, max: 3 });

  process.stdout.write(`=== refill-incomplete-anns 시작: ${total}개월 ===\n`);
  const tStart = Date.now();
  let okCount = 0, failCount = 0;
  const failures: string[] = [];

  for (let i = 0; i < total; i++) {
    const e = list[i];
    const t0 = Date.now();
    const result = await refillMonth(pool, e);
    const sec = Math.round((Date.now() - t0) / 1000);
    const status = result.ok ? "✅" : "❌";
    process.stdout.write(
      `[${i + 1}/${total}] ${status} ${e.ym} | ${result.before}→${result.after} | G2B=${result.api} | ${result.ratio.toFixed(1)}% | sample=${result.sample} | ${sec}s\n`,
    );
    if (result.ok) okCount++; else { failCount++; failures.push(e.ym); }
  }

  const totalSec = Math.round((Date.now() - tStart) / 1000);
  process.stdout.write(`=== 완료: 성공 ${okCount} / 실패 ${failCount} / ${totalSec}s ===\n`);
  if (failures.length > 0) {
    process.stdout.write(`실패 월: ${failures.join(",")}\n`);
  }
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
