/**
 * Vercel Cron — G2B 나라장터 데이터 자동 수집
 *
 * ?mode=recent  → 최근 2일치만 sync (매 1시간)
 * (default)     → 역대 전체 + 오늘 sync (매일 03:00 KST)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  g2bFetchAnnouncementPage,
  g2bFetchBidResultPage,
  g2bExtractRegion,
  g2bParseDate,
  toYMD,
  daysAgo,
  type G2BAnnouncement,
  type G2BBidResult,
} from "@/lib/g2b";

export const maxDuration = 300;

const NUM_OF_ROWS = 100;
const MONTHS_PER_RUN = 12;
const G2B_OLDEST = "201201";

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
      if (!konepsId || !title || !orgName || isNaN(budgetNum) || !deadline) return null;
      const rawJson: Record<string, string> = {};
      for (const [k, v] of Object.entries(item)) rawJson[k] = String(v ?? "");
      return {
        id: crypto.randomUUID(),
        konepsId, title, orgName,
        budget: budgetNum,
        deadline,
        category: item.indutyCtgryNm || item.ntceKindNm || "",
        region: g2bExtractRegion(item.ntceInsttAddr || ""),
        rawJson,
      };
    }).filter(Boolean);

    if (rows.length > 0) {
      // on_conflict=konepsId: konepsId 중복 시 기존 행 업데이트
      const r = await fetch(`${url}/rest/v1/Announcement?on_conflict=konepsId`, {
        method: "POST", headers: supabaseHeaders(key), body: JSON.stringify(rows),
      });
      if (r.ok) saved += rows.length;
      else {
        const errText = await r.text();
        console.error(`[importAnnouncements] upsert 실패 ${r.status}:`, errText);
      }
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

// ─── 커서 관리 ────────────────────────────────────────────────────────────────
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

function lastDayOfMonth(ym: string): string {
  const y = parseInt(ym.slice(0, 4));
  const m = parseInt(ym.slice(4, 6));
  const last = new Date(y, m, 0).getDate();
  return `${ym}${String(last).padStart(2, "0")}`;
}

function prevMonth(ym: string, n = 1): string {
  const y = parseInt(ym.slice(0, 4));
  const m = parseInt(ym.slice(4, 6)) - n;
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Cron 진입점 ──────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const validTokens = [process.env.CRON_SECRET, process.env.ADMIN_SECRET_KEY].filter(Boolean);
  if (!token || !validTokens.includes(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Supabase 환경변수 누락" }, { status: 500 });
  }

  const mode = new URL(request.url).searchParams.get("mode");
  const isRecentOnly = mode === "recent";
  const today   = toYMD(new Date());
  const twoDaysAgo = toYMD(daysAgo(2));
  const log: Record<string, unknown> = { mode: isRecentOnly ? "recent" : "full" };

  try {
    // ── 최근 2일치 공고 sync (매시간 + 전체 실행 모두) ──────────────────────
    const recentAnn = await importAnnouncements(supabaseUrl, serviceKey, twoDaysAgo, today);
    let recentBid = 0;
    try { recentBid = await importBidResults(supabaseUrl, serviceKey, twoDaysAgo, today); }
    catch (e) { console.error("[cron] 낙찰결과 수집 실패:", e); }
    log.recent = { announcements: recentAnn, bidResults: recentBid, from: twoDaysAgo, to: today };

    if (isRecentOnly) {
      return NextResponse.json({ ok: true, ...log });
    }

    // ── 역대 과거 수집 (커서 방식, 1회 실행 시 MONTHS_PER_RUN 개월) ─────────
    const curMonth = currentMonth();
    const cursor = await readCursor(supabaseUrl, serviceKey);
    const startFrom = cursor ? prevMonth(cursor) : curMonth;

    if (startFrom >= G2B_OLDEST) {
      const batches: { from: string; to: string; ym: string }[] = [];
      let ym = startFrom;
      for (let i = 0; i < MONTHS_PER_RUN && ym >= G2B_OLDEST; i++) {
        batches.push({ from: `${ym}01`, to: lastDayOfMonth(ym), ym });
        ym = prevMonth(ym);
      }

      let histAnn = 0, histBid = 0;
      for (const { from, to, ym: bYm } of batches) {
        const a = await importAnnouncements(supabaseUrl, serviceKey, from, to);
        let b = 0;
        try { b = await importBidResults(supabaseUrl, serviceKey, from, to); }
        catch (e) { console.error("[cron] 낙찰결과 수집 실패:", e); }
        histAnn += a; histBid += b;
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

    // ── 낙찰결과가 수집됐으면 통계 캐시 재집계 ─────────────────────────────
    const totalBidResults =
      ((log.recent as Record<string,number>)?.bidResults ?? 0) +
      ((log.historical as Record<string,number>)?.bidResults ?? 0);

    if (totalBidResults > 0) {
      try {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://naktal.me";
        await fetch(`${siteUrl}/api/admin/rebuild-stat-cache`, {
          method: "POST",
          headers: { "x-admin-key": process.env.ADMIN_SECRET_KEY ?? "" },
        });
        log.statCacheRebuild = "triggered";
      } catch (e) {
        console.error("[cron] 통계 캐시 재집계 실패:", e);
        log.statCacheRebuild = "failed";
      }
    }

    return NextResponse.json({ ok: true, ...log });
  } catch (err) {
    console.error("[cron/sync-g2b]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
