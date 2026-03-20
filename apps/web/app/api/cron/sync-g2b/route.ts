/**
 * Vercel Cron Job — G2B 나라장터 데이터 자동 수집
 *
 * vercel.json에서 매일 KST 06:00 / 12:00 / 18:00 자동 실행됩니다.
 * 최초 실행 시 (DB가 비어있으면) 자동으로 과거 2년치 데이터를 수집합니다.
 * 이후 실행부터는 오늘 데이터만 추가합니다.
 *
 * Required env:
 *   G2B_API_KEY             공공데이터포털 인증키
 *   SUPABASE_SERVICE_ROLE_KEY  Supabase service_role 키
 *   CRON_SECRET             Vercel이 전달하는 비밀키 (vercel.json 자동 설정)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  g2bFetchAnnouncementPage,
  g2bFetchBidResultPage,
  g2bExtractRegion,
  g2bParseDate,
  toYMD,
  type G2BAnnouncement,
  type G2BBidResult,
} from "@/lib/g2b";

const NUM_OF_ROWS = 100;

// ─── 공고 upsert ──────────────────────────────────────────────────────────────
async function importAnnouncements(
  supabaseUrl: string,
  serviceRoleKey: string,
  fromDate: string,
  toDate: string,
): Promise<number> {
  let page = 1, saved = 0;

  while (true) {
    const { items, totalCount } = await g2bFetchAnnouncementPage({
      pageNo: page,
      numOfRows: NUM_OF_ROWS,
      inqryBgnDt: `${fromDate}0000`,
      inqryEndDt: `${toDate}2359`,
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
        konepsId, title, orgName,
        budget: String(budgetNum),
        deadline,
        category: item.ntceKindNm || item.indutyCtgryNm || "",
        region: g2bExtractRegion(item.ntceInsttAddr || ""),
        rawJson,
      };
    }).filter(Boolean);

    if (rows.length > 0) {
      const r = await fetch(`${supabaseUrl}/rest/v1/Announcement`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Prefer": "resolution=merge-duplicates",
        },
        body: JSON.stringify(rows),
      });
      if (r.ok) saved += rows.length;
    }

    if (page * NUM_OF_ROWS >= totalCount) break;
    page++;
    await new Promise((r) => setTimeout(r, 300));
  }

  return saved;
}

// ─── 낙찰결과 upsert ──────────────────────────────────────────────────────────
async function importBidResults(
  supabaseUrl: string,
  serviceRoleKey: string,
  fromDate: string,
  toDate: string,
): Promise<number> {
  let page = 1, saved = 0;

  while (true) {
    const { items, totalCount } = await g2bFetchBidResultPage({
      pageNo: page,
      numOfRows: NUM_OF_ROWS,
      inqryBgnDt: `${fromDate}0000`,
      inqryEndDt: `${toDate}2359`,
    });

    if (items.length === 0) break;

    const rows = items.map((item: G2BBidResult) => {
      const annId      = item.bidNtceNo?.trim();
      const bidRateRaw = (item.sucsfbidRate || "").replace(/[^0-9.]/g, "");
      const priceRaw   = (item.sucsfbidAmt || "").replace(/[^0-9]/g, "");
      if (!annId || !bidRateRaw || !priceRaw) return null;
      return {
        annId,
        bidRate: parseFloat(bidRateRaw).toFixed(4),
        finalPrice: String(parseInt(priceRaw, 10)),
        numBidders: parseInt((item.totPrtcptCo || "0").replace(/[^0-9]/g, ""), 10),
      };
    }).filter(Boolean);

    if (rows.length > 0) {
      const r = await fetch(`${supabaseUrl}/rest/v1/BidResult`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Prefer": "resolution=merge-duplicates",
        },
        body: JSON.stringify(rows),
      });
      if (r.ok) saved += rows.length;
    }

    if (page * NUM_OF_ROWS >= totalCount) break;
    page++;
    await new Promise((r) => setTimeout(r, 300));
  }

  return saved;
}

// ─── 날짜 범위를 월 단위로 분할 ──────────────────────────────────────────────
function splitByMonth(fromYMD: string, toYMD: string): { from: string; to: string }[] {
  const ranges: { from: string; to: string }[] = [];
  let cur = new Date(`${fromYMD.slice(0, 4)}-${fromYMD.slice(4, 6)}-01`);
  const end = new Date(`${toYMD.slice(0, 4)}-${toYMD.slice(4, 6)}-01`);

  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const lastDay = new Date(y, cur.getMonth() + 1, 0).getDate();
    const from = `${y}${m}01`;
    const to   = `${y}${m}${String(lastDay).padStart(2, "0")}`;
    ranges.push({ from, to });
    cur.setMonth(cur.getMonth() + 1);
  }

  return ranges;
}

// ─── DB 총 레코드 수 확인 ─────────────────────────────────────────────────────
async function getTotalCount(supabaseUrl: string, serviceRoleKey: string): Promise<number> {
  const r = await fetch(`${supabaseUrl}/rest/v1/Announcement?select=count`, {
    headers: {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Prefer": "count=exact",
      "Range": "0-0",
    },
  });
  const rangeHeader = r.headers.get("Content-Range");
  if (!rangeHeader) return 0;
  const total = rangeHeader.split("/")[1];
  return parseInt(total || "0", 10);
}

// ─── Cron 진입점 ──────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  // Vercel Cron 인증 확인
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase 환경변수 누락" }, { status: 500 });
  }

  const today   = toYMD(new Date());
  const results: Record<string, unknown> = {};

  try {
    const totalCount = await getTotalCount(supabaseUrl, serviceRoleKey);

    if (totalCount === 0) {
      // ── 최초 실행: 과거 2년치 전체 수집 ───────────────────────────────────
      console.log("[cron/sync-g2b] 최초 실행 — 과거 2년치 데이터 수집 시작");

      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      const fromDate = toYMD(twoYearsAgo);

      const months = splitByMonth(fromDate, today);
      let annTotal = 0, bidTotal = 0;

      for (const { from, to } of months) {
        const [ann, bid] = await Promise.all([
          importAnnouncements(supabaseUrl, serviceRoleKey, from, to),
          importBidResults(supabaseUrl, serviceRoleKey, from, to),
        ]);
        annTotal += ann;
        bidTotal += bid;
        console.log(`[cron/sync-g2b] ${from}~${to}: 공고 ${ann}건, 낙찰결과 ${bid}건`);
        await new Promise((r) => setTimeout(r, 500));
      }

      results.mode = "initial_bulk_import";
      results.announcements = annTotal;
      results.bidResults = bidTotal;
      results.months = months.length;

    } else {
      // ── 일반 실행: 오늘 데이터만 추가 ────────────────────────────────────
      const [ann, bid] = await Promise.all([
        importAnnouncements(supabaseUrl, serviceRoleKey, today, today),
        importBidResults(supabaseUrl, serviceRoleKey, today, today),
      ]);

      results.mode = "daily_sync";
      results.date = today;
      results.announcements = ann;
      results.bidResults = bid;
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (err) {
    console.error("[cron/sync-g2b]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
