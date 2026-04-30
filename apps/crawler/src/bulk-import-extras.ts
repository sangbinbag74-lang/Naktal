/**
 * G2B 보조 정보 7개 API를 날짜 bulk로 호출해 Announcement 및 관련 테이블에 저장
 *
 * 호출 API (모두 inqryDiv=1 bulk 가능 확인됨):
 *   1. getBidPblancListInfoLicenseLimit        → subCategories
 *   2. getBidPblancListInfoCnstwkBsisAmount    → bsisAmt, rsrvtnPrceRng*, priceRangeRate
 *   3. getBidPblancListInfoServcBsisAmount     → 동일 (용역)
 *   4. getBidPblancListInfoThngBsisAmount      → 동일 (물품)
 *   5. getBidPblancListBidPrceCalclAInfo       → aValueTotal + aValueDetails
 *   6. getBidPblancListInfoChgHstryCnstwk      → AnnouncementChgHst
 *   7. getBidPblancListInfoFrgcpt              → 외자 공고 (Announcement에 upsert)
 *
 * 실행:
 *   pnpm ts-node src/bulk-import-extras.ts [--from YYYYMM] [--to YYYYMM]
 *   기본: 200201 ~ 현재월
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

// ─── env ────────────────────────────────────────────────────────────────────
function loadEnv(): { dbUrl: string; apiKey: string } {
  const rootEnv = path.resolve(__dirname, "../../../.env");
  const env: Record<string, string> = {};
  try {
    const c = fs.readFileSync(rootEnv, "utf-8");
    for (const l of c.split("\n")) {
      const t = l.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      env[k] = v;
    }
  } catch {}
  const dbUrl = env.DATABASE_URL || process.env.DATABASE_URL || "";
  const apiKey = env.KONEPS_API_KEY || env.G2B_API_KEY || process.env.KONEPS_API_KEY || "";
  if (!dbUrl || !apiKey) throw new Error("DATABASE_URL 또는 KONEPS_API_KEY 없음");
  return { dbUrl, apiKey };
}

const BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";
const PAGE_SIZE = 999;

// ─── API 호출 ───────────────────────────────────────────────────────────────
interface G2BResponse<T = unknown> {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: {
      items?: T[] | { item: T | T[] };
      numOfRows?: number;
      pageNo?: number;
      totalCount?: number;
    };
  };
}

function normalizeItems<T>(items: unknown): T[] {
  if (!items) return [];
  if (Array.isArray(items)) return items as T[];
  const obj = items as { item?: T | T[] };
  if (obj.item == null) return [];
  return Array.isArray(obj.item) ? obj.item : [obj.item];
}

async function fetchPage<T>(
  op: string,
  params: Record<string, string>,
  pageNo: number,
  apiKey: string,
): Promise<{ items: T[]; totalCount: number }> {
  const url = new URL(`${BASE}/${op}`);
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("inqryDiv", "1");
  url.searchParams.set("numOfRows", String(PAGE_SIZE));
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("type", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  for (let retry = 0; retry < 3; retry++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as G2BResponse<T>;
      const code = json.response?.header?.resultCode;
      if (code && code !== "00") throw new Error(`${code}: ${json.response?.header?.resultMsg}`);
      const items = normalizeItems<T>(json.response?.body?.items);
      const totalCount = json.response?.body?.totalCount ?? 0;
      return { items, totalCount };
    } catch (e) {
      if (retry === 2) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (retry + 1)));
    }
  }
  return { items: [], totalCount: 0 };
}

async function fetchAll<T>(
  op: string,
  params: Record<string, string>,
  apiKey: string,
  label: string,
): Promise<T[]> {
  const all: T[] = [];
  let pageNo = 1;
  while (true) {
    const { items, totalCount } = await fetchPage<T>(op, params, pageNo, apiKey);
    all.push(...items);
    if (pageNo === 1) {
      console.log(`    ${label}: ${totalCount}건 예상`);
    }
    if (items.length < PAGE_SIZE) break;
    pageNo++;
    if (pageNo > 100) { console.error(`    [${op}] 100페이지 초과, 중단`); break; }
  }
  return all;
}

// ─── 1. LicenseLimit → subCategories ────────────────────────────────────────
interface LicenseLimitItem {
  bidNtceNo: string;
  lcnsLmtNm?: string;
  indstrytyMfrcFldList?: string;
}

function parseIndstrytyList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const matches = raw.matchAll(/\[\d+\^([^\]]+)\]/g);
  const out = new Set<string>();
  for (const m of matches) out.add(m[1].trim());
  return Array.from(out);
}

function parseLcnsLmtNm(raw: string | undefined | null): string | null {
  if (!raw) return null;
  // "조경식재공사업/4992" → "조경식재공사업"
  const idx = raw.indexOf("/");
  return idx > 0 ? raw.slice(0, idx).trim() : raw.trim();
}

async function upsertLicenseLimit(items: LicenseLimitItem[], client: any): Promise<void> {
  // 공고별로 업종 리스트 집계
  const byAnn = new Map<string, Set<string>>();
  for (const it of items) {
    if (!it.bidNtceNo) continue;
    const set = byAnn.get(it.bidNtceNo) ?? new Set<string>();
    parseIndstrytyList(it.indstrytyMfrcFldList).forEach((x) => set.add(x));
    const fromName = parseLcnsLmtNm(it.lcnsLmtNm);
    if (fromName) set.add(fromName);
    byAnn.set(it.bidNtceNo, set);
  }
  // upsert 개별 (배열 컬럼은 ON CONFLICT로 array_cat 합치기)
  for (const [annId, set] of byAnn) {
    if (set.size === 0) continue;
    await client.query(
      `
      UPDATE "Announcement"
      SET "subCategories" = (
        SELECT ARRAY_AGG(DISTINCT x) FROM UNNEST("subCategories" || $2::text[]) AS x
      )
      WHERE "konepsId" = $1
      `,
      [annId, Array.from(set)],
    );
  }
}

// ─── 2~4. BsisAmount → bsisAmt + priceRange + priceRangeRate ───────────────
interface BsisAmountItem {
  bidNtceNo: string;
  bssamt?: string;
  rsrvtnPrceRngBgnRate?: string;
  rsrvtnPrceRngEndRate?: string;
}

async function upsertBsisAmount(items: BsisAmountItem[], client: any): Promise<void> {
  for (const it of items) {
    if (!it.bidNtceNo) continue;
    const bs = BigInt(parseInt((it.bssamt ?? "0").replace(/[^0-9]/g, ""), 10) || 0);
    const bg = parseFloat((it.rsrvtnPrceRngBgnRate ?? "0").replace(/[^\-0-9.]/g, "")) || 0;
    const ed = parseFloat((it.rsrvtnPrceRngEndRate ?? "0").replace(/[^\-0-9.]/g, "")) || 0;
    const rangeStr = bg !== 0 || ed !== 0 ? `${bg}~${ed}` : "";
    await client.query(
      `
      UPDATE "Announcement"
      SET "bsisAmt" = CASE WHEN $2::bigint > 0 THEN $2 ELSE "bsisAmt" END,
          "rsrvtnPrceRngBgnRate" = $3,
          "rsrvtnPrceRngEndRate" = $4,
          "priceRangeRate" = CASE WHEN "priceRangeRate" = '' THEN $5 ELSE "priceRangeRate" END
      WHERE "konepsId" = $1
      `,
      [it.bidNtceNo, bs.toString(), bg, ed, rangeStr],
    );
  }
}

// ─── 5. BidPrceCalclAInfo → aValueTotal + aValueDetails ─────────────────────
interface CalclAItem {
  bidNtceNo: string;
  sftyMngcst?: string;
  sftyChckMngcst?: string;
  rtrfundNon?: string;
  mrfnHealthInsrprm?: string;
  npnInsrprm?: string;
  odsnLngtrmrcprInsrprm?: string;
  qltyMngcst?: string;
}

async function upsertCalclA(items: CalclAItem[], client: any): Promise<void> {
  for (const it of items) {
    if (!it.bidNtceNo) continue;
    const toNum = (s: string | undefined) => parseInt((s ?? "0").replace(/[^0-9]/g, ""), 10) || 0;
    const details = {
      sftyMngcst: toNum(it.sftyMngcst),
      sftyChckMngcst: toNum(it.sftyChckMngcst),
      rtrfundNon: toNum(it.rtrfundNon),
      mrfnHealthInsrprm: toNum(it.mrfnHealthInsrprm),
      npnInsrprm: toNum(it.npnInsrprm),
      odsnLngtrmrcprInsrprm: toNum(it.odsnLngtrmrcprInsrprm),
      qltyMngcst: toNum(it.qltyMngcst),
    };
    const total = Object.values(details).reduce((s, v) => s + v, 0);
    if (total === 0) continue;
    await client.query(
      `
      UPDATE "Announcement"
      SET "aValueTotal"   = $2::bigint,
          "aValueDetails" = $3::jsonb,
          "aValueYn"      = CASE WHEN "aValueYn" = '' THEN 'Y' ELSE "aValueYn" END
      WHERE "konepsId" = $1
      `,
      [it.bidNtceNo, BigInt(total).toString(), JSON.stringify(details)],
    );
  }
}

// ─── 6. ChgHstry → AnnouncementChgHst ───────────────────────────────────────
interface ChgHstItem {
  bidNtceNo: string;
  bidNtceOrd?: string;
  chgNtceSeq?: string;
  chgNtceRsnNm?: string;
  chgNtceDt?: string;
  [k: string]: unknown;
}

async function upsertChgHst(items: ChgHstItem[], client: any): Promise<void> {
  for (const it of items) {
    if (!it.bidNtceNo) continue;
    const seq = parseInt(it.chgNtceSeq ?? "0", 10) || 0;
    const chgDate = it.chgNtceDt ? new Date(it.chgNtceDt.replace(" ", "T") + "+09:00") : null;
    await client.query(
      `
      INSERT INTO "AnnouncementChgHst" (id, "annId", "chgNtceSeq", "chgDate", "rawJson")
      VALUES (gen_random_uuid()::text, $1, $2, $3, $4::jsonb)
      ON CONFLICT ("annId", "chgNtceSeq") DO UPDATE SET
        "chgDate"  = EXCLUDED."chgDate",
        "rawJson"  = EXCLUDED."rawJson"
      `,
      [
        it.bidNtceNo,
        seq,
        chgDate,
        JSON.stringify(it),
      ],
    );
  }
}

// ─── main loop (월별) ───────────────────────────────────────────────────────
function parseYYYYMM(arg: string): [number, number] {
  return [parseInt(arg.slice(0, 4), 10), parseInt(arg.slice(4, 6), 10)];
}

function fmtDt(y: number, m: number, day: number, hh: string): string {
  return `${y}${String(m).padStart(2, "0")}${String(day).padStart(2, "0")}${hh}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

async function main() {
  const args = process.argv.slice(2);
  const fromArg = args.find((a) => a.startsWith("--from="))?.slice(7)
               ?? (args.includes("--from") ? args[args.indexOf("--from") + 1] : "200201");
  const toArg = args.find((a) => a.startsWith("--to="))?.slice(5)
             ?? (args.includes("--to") ? args[args.indexOf("--to") + 1] : undefined);

  const [fromY, fromM] = parseYYYYMM(fromArg);
  const now = new Date();
  const [toY, toM] = toArg ? parseYYYYMM(toArg) : [now.getFullYear(), now.getMonth() + 1];

  const { dbUrl, apiKey } = loadEnv();
  const pool = new Pool({ connectionString: dbUrl, max: 3, statement_timeout: 0 });

  const months: [number, number][] = [];
  let y = fromY, m = fromM;
  while (y < toY || (y === toY && m <= toM)) {
    months.push([y, m]);
    m++; if (m > 12) { m = 1; y++; }
  }
  console.log(`=== Bulk Extras 수집: ${fromArg} ~ ${toY}${String(toM).padStart(2, "0")} (${months.length}개월) ===\n`);

  const tStart = Date.now();
  for (let i = 0; i < months.length; i++) {
    const [yy, mm] = months[i];
    const last = daysInMonth(yy, mm);
    const bgn = fmtDt(yy, mm, 1, "0000");
    const end = fmtDt(yy, mm, last, "2359");
    const elapsed = ((Date.now() - tStart) / 1000 / 60).toFixed(1);
    console.log(`[${i + 1}/${months.length}] ${yy}-${String(mm).padStart(2, "0")} (경과 ${elapsed}분)`);

    const client = await pool.connect();
    try {
      // 1. LicenseLimit
      const licenseItems = await fetchAll<LicenseLimitItem>(
        "getBidPblancListInfoLicenseLimit",
        { inqryBgnDt: bgn, inqryEndDt: end },
        apiKey,
        "LicenseLimit",
      );
      if (licenseItems.length > 0) await upsertLicenseLimit(licenseItems, client);

      // 2. CnstwkBsisAmount
      const cnsBs = await fetchAll<BsisAmountItem>(
        "getBidPblancListInfoCnstwkBsisAmount",
        { inqryBgnDt: bgn, inqryEndDt: end },
        apiKey,
        "CnstwkBsisAmount",
      );
      if (cnsBs.length > 0) await upsertBsisAmount(cnsBs, client);

      // 3. ServcBsisAmount
      const sv = await fetchAll<BsisAmountItem>(
        "getBidPblancListInfoServcBsisAmount",
        { inqryBgnDt: bgn, inqryEndDt: end },
        apiKey,
        "ServcBsisAmount",
      );
      if (sv.length > 0) await upsertBsisAmount(sv, client);

      // 4. ThngBsisAmount
      const th = await fetchAll<BsisAmountItem>(
        "getBidPblancListInfoThngBsisAmount",
        { inqryBgnDt: bgn, inqryEndDt: end },
        apiKey,
        "ThngBsisAmount",
      );
      if (th.length > 0) await upsertBsisAmount(th, client);

      // 5. CalclA
      const calA = await fetchAll<CalclAItem>(
        "getBidPblancListBidPrceCalclAInfo",
        { inqryBgnDt: bgn, inqryEndDt: end },
        apiKey,
        "CalclA",
      );
      if (calA.length > 0) await upsertCalclA(calA, client);

      // 6. ChgHstryCnstwk
      const chg = await fetchAll<ChgHstItem>(
        "getBidPblancListInfoChgHstryCnstwk",
        { inqryBgnDt: bgn, inqryEndDt: end },
        apiKey,
        "ChgHstryCnstwk",
      );
      if (chg.length > 0) await upsertChgHst(chg, client);
    } catch (e) {
      console.error(`  ✗ ${yy}-${mm}: ${(e as Error).message}`);
    } finally {
      client.release();
    }
  }

  const totalMin = ((Date.now() - tStart) / 1000 / 60).toFixed(1);
  console.log(`\n=== 전체 완료: ${totalMin}분 ===`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
