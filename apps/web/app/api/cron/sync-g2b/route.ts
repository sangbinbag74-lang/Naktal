/**
 * Vercel Cron — G2B 나라장터 데이터 자동 수집
 *
 * 스케줄: 매일 KST 09:00~18:00 매 1시간 (UTC 00~09시)
 * 동작:
 *  - 최초 실행부터 역대 모든 데이터 수집 (G2B API 시작: 2012-01-01)
 *  - 한 번 실행 시 12개월치씩 처리 (Vercel 타임아웃 대응)
 *  - 과거 수집 완료 후에는 매 실행마다 오늘 데이터 추가
 *  - 커서를 CrawlLog에 저장해 재시작 시에도 이어서 수집
 */

import { NextRequest, NextResponse } from "next/server";
import {
  g2bFetchAnnouncementPage,
  g2bFetchBidResultPage,
  g2bExtractRegion,
  g2bParseDate,
  toYMD,
  type G2BAnnouncement,
  type G2BBidResult,
} from "@/lib/g2b";

export const maxDuration = 300; // Vercel Pro: 5분

const NUM_OF_ROWS = 100;
const MONTHS_PER_RUN = 12;      // 한 번 실행 시 최대 12개월 처리
const G2B_OLDEST = "201201";    // 나라장터 G2B API 데이터 시작월 (2012-01)

type SupabaseHeaders = Record<string, string>;

function supabaseHeaders(key: string): SupabaseHeaders {
  return {
    "Content-Type": "application/json",
    "apikey": key,
    "Authorization": `Bearer ${key}`,
    "Prefer": "resolution=merge-duplicates",
  };
}

// ─── 공고 upsert ──────────────────────────────────────────────────────────────
async function importAnnouncements(
  url: string, key: string, fromDate: string, toDate: string
): Promise<number> {
  let page = 1, saved = 0;
  while (true) {
    const { items, totalCount } = await g2bFetchAnnouncementPage({
      pageNo: page, numOfRows: NUM_OF_ROWS,
      inqryBgnDt: `${fromDate}0000`, inqryEndDt: `${toDate}2359`,
    });
    if (items.length === 0) break;

    const rows = items.map((item: G2BAnnouncement) => {
      const konepsId  = item.bidNtceNo?.trim();
      const title     = item.bidNtceNm?.trim();
      const orgName   = (item.ntceInsttNm || item.demInsttNm)?.trim();
      const budgetNum = parseInt((item.asignBdgtAmt || item.presmptPrce || "0").replace(/[^0-9]/g, ""), 10);
      const deadline  = g2bParseDate(item.bidClseDt);
      if (!konepsId || !title || !orgName || !budgetNum || !deadline) return null;
      const rawJson: Record<string, string> = {};
      for (const [k, v] of Object.entries(item)) rawJson[k] = String(v ?? "");
      return {
        konepsId, title, orgName, budget: String(budgetNum), deadline,
        category: item.ntceKindNm || item.indutyCtgryNm || "",
        region: g2bExtractRegion(item.ntceInsttAddr || ""),
        rawJson,
      };
    }).filter(Boolean);

    if (rows.length > 0) {
      const r = await fetch(`${url}/rest/v1/Announcement`, {
        method: "POST", headers: supabaseHeaders(key), body: JSON.stringify(rows),
      });
      if (r.ok) saved += rows.length;
    }
    if (page * NUM_OF_ROWS >= totalCount) break;
    page++;
    await sleep(200);
  }
  return saved;
}

// ─── 낙찰결과 upsert ──────────────────────────────────────────────────────────
async function importBidResults(
  url: string, key: string, fromDate: string, toDate: string
): Promise<number> {
  let page = 1, saved = 0;
  while (true) {
    const { items, totalCount } = await g2bFetchBidResultPage({
      pageNo: page, numOfRows: NUM_OF_ROWS,
      inqryBgnDt: `${fromDate}0000`, inqryEndDt: `${toDate}2359`,
    });
    if (items.length === 0) break;

    const rows = items.map((item: G2BBidResult) => {
      const annId     = item.bidNtceNo?.trim();
      const rateRaw   = (item.sucsfbidRate || "").replace(/[^0-9.]/g, "");
      const priceRaw  = (item.sucsfbidAmt  || "").replace(/[^0-9]/g, "");
      if (!annId || !rateRaw || !priceRaw) return null;
      return {
        annId,
        bidRate: parseFloat(rateRaw).toFixed(4),
        finalPrice: String(parseInt(priceRaw, 10)),
        numBidders: parseInt((item.totPrtcptCo || "0").replace(/[^0-9]/g, ""), 10),
      };
    }).filter(Boolean);

    if (rows.length > 0) {
      const r = await fetch(`${url}/rest/v1/BidResult`, {
        method: "POST", headers: supabaseHeaders(key), body: JSON.stringify(rows),
      });
      if (r.ok) saved += rows.length;
    }
    if (page * NUM_OF_ROWS >= totalCount) break;
    page++;
    await sleep(200);
  }
  return saved;
}

// ─── 커서 관리 (CrawlLog 테이블 활용) ────────────────────────────────────────
// CrawlLog.type = "HIST_CURSOR" 인 row의 errors 필드에 "YYYYMM" 저장

async function readCursor(url: string, key: string): Promise<string | null> {
  const r = await fetch(
    `${url}/rest/v1/CrawlLog?type=eq.HIST_CURSOR&order=createdAt.desc&limit=1`,
    { headers: { "apikey": key, "Authorization": `Bearer ${key}` } }
  );
  const rows = await r.json() as { errors: string }[];
  return rows?.[0]?.errors ?? null;
}

async function writeCursor(url: string, key: string, cursor: string): Promise<void> {
  await fetch(`${url}/rest/v1/CrawlLog`, {
    method: "POST",
    headers: supabaseHeaders(key),
    body: JSON.stringify({ type: "HIST_CURSOR", status: "SUCCESS", count: 0, errors: cursor }),
  });
}

// ─── 유틸 ────────────────────────────────────────────────────────────────────
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

/** YYYYMM → 해당 월의 마지막 날 YYYYMMDD */
function lastDayOfMonth(ym: string): string {
  const y = parseInt(ym.slice(0, 4));
  const m = parseInt(ym.slice(4, 6));
  const last = new Date(y, m, 0).getDate();
  return `${ym}${String(last).padStart(2, "0")}`;
}

/** YYYYMM을 N개월 이전으로 이동 */
function prevMonth(ym: string, n = 1): string {
  const y = parseInt(ym.slice(0, 4));
  const m = parseInt(ym.slice(4, 6)) - n;
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 현재 월 YYYYMM */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Cron 진입점 ──────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Supabase 환경변수 누락" }, { status: 500 });
  }

  const today = toYMD(new Date());
  const curMonth = currentMonth();
  const log: Record<string, unknown> = {};

  try {
    // ── 1. 오늘 데이터 (항상 먼저) ────────────────────────────────────────────
    const [todayAnn, todayBid] = await Promise.all([
      importAnnouncements(supabaseUrl, serviceKey, today, today),
      importBidResults(supabaseUrl, serviceKey, today, today),
    ]);
    log.today = { announcements: todayAnn, bidResults: todayBid };

    // ── 2. 역대 과거 수집 (커서 방식, 회차당 MONTHS_PER_RUN 개월) ────────────
    const cursor = await readCursor(supabaseUrl, serviceKey);
    // cursor가 없으면 이번 달부터 시작, 있으면 커서 이전 달부터
    const startFrom = cursor ? prevMonth(cursor) : curMonth;

    if (startFrom >= G2B_OLDEST) {
      const batches: { from: string; to: string; ym: string }[] = [];
      let ym = startFrom;

      for (let i = 0; i < MONTHS_PER_RUN && ym >= G2B_OLDEST; i++) {
        const fromDate = `${ym}01`;
        const toDate   = lastDayOfMonth(ym);
        batches.push({ from: fromDate, to: toDate, ym });
        ym = prevMonth(ym);
      }

      let histAnn = 0, histBid = 0;
      for (const { from, to, ym: bYm } of batches) {
        const [a, b] = await Promise.all([
          importAnnouncements(supabaseUrl, serviceKey, from, to),
          importBidResults(supabaseUrl, serviceKey, from, to),
        ]);
        histAnn += a;
        histBid += b;
        // 마지막으로 처리한 월을 커서로 저장 (다음 실행 시 이 이전부터 시작)
        await writeCursor(supabaseUrl, serviceKey, bYm);
        await sleep(300);
      }

      const lastBatch = batches[batches.length - 1];
      const nextCursor = lastBatch ? prevMonth(lastBatch.ym) : G2B_OLDEST;
      log.historical = {
        processed: batches.map((b) => b.ym),
        announcements: histAnn,
        bidResults: histBid,
        nextCursor,
        done: nextCursor < G2B_OLDEST,
      };
    } else {
      log.historical = { done: true, message: "2012년부터 현재까지 모든 데이터 수집 완료" };
    }

    return NextResponse.json({ ok: true, ...log });
  } catch (err) {
    console.error("[cron/sync-g2b]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
