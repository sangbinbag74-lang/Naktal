/**
 * sync-g2b 의 단계별 timing 측정 — 어디서 시간 쓰는지 정확 진단용
 * mode=recent 와 동일 흐름으로 importAnnouncements + importBidResults 직접 실행
 *
 * 결과: 각 operation 별 페이지 수, fetch 시간, upsert 시간
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { g2bFetchAnnouncementPage, g2bFetchAllBidResults, toYMD, daysAgo, type G2BAnnouncement, g2bExtractRegion, g2bParseDate, g2bGetCategory } from "@/lib/g2b";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const NTCE_OPS = [
  "getBidPblancListInfoServc",
  "getBidPblancListInfoCnstwk",
  "getBidPblancListInfoThng",
] as const;
const NUM_OF_ROWS = 100;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const today = toYMD(new Date());
  const twoDaysAgo = toYMD(daysAgo(2));

  const results: Array<Record<string, unknown>> = [];
  const overallStart = Date.now();

  // 1. Announcement 3 op × 페이지 측정
  for (const op of NTCE_OPS) {
    const opStart = Date.now();
    let page = 1, fetched = 0, upserted = 0, fetchMs = 0, upsertMs = 0;
    let firstUpsertErr: string | null = null;
    try {
      while (true) {
        const f0 = Date.now();
        const { items } = await g2bFetchAnnouncementPage({
          pageNo: page, numOfRows: NUM_OF_ROWS,
          inqryBgnDt: `${twoDaysAgo}0000`, inqryEndDt: `${today}2359`,
          operation: op,
        });
        fetchMs += Date.now() - f0;
        if (items.length === 0) break;
        fetched += items.length;

        // upsert 시뮬레이션 (실제 안 함 — 진단만)
        const u0 = Date.now();
        const rows = items.map((item: G2BAnnouncement) => {
          const konepsId = item.bidNtceNo?.trim();
          const title = item.bidNtceNm?.trim();
          const orgName = (item.ntceInsttNm || item.demInsttNm)?.trim();
          const budgetNum = parseInt((item.asignBdgtAmt || item.presmptPrce || "0").replace(/[^0-9]/g, ""), 10);
          const deadline = g2bParseDate(item.bidClseDt);
          if (!konepsId || !title || !orgName || isNaN(budgetNum) || !deadline) return null;
          const rawJson: Record<string, string> = {};
          for (const [k, v] of Object.entries(item)) rawJson[k] = String(v ?? "");
          return { konepsId, title, orgName, budget: budgetNum, deadline,
            category: g2bGetCategory(item, op),
            region: g2bExtractRegion(item.ntceInsttAddr || ""), rawJson };
        }).filter(Boolean);
        if (rows.length > 0) {
          const r = await fetch(`${supabaseUrl}/rest/v1/Announcement?on_conflict=konepsId`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": serviceKey,
              "Authorization": `Bearer ${serviceKey}`,
              "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            body: JSON.stringify(rows),
          });
          if (r.ok) upserted += rows.length;
          else {
            upserted += -1;
            if (!firstUpsertErr) {
              const t = await r.text().catch(() => "");
              firstUpsertErr = `HTTP ${r.status}: ${t.slice(0, 300)}`;
            }
          }
        }
        upsertMs += Date.now() - u0;
        page++;
        if (page > 50) break; // 안전 한도
      }
      results.push({
        op, pages: page - 1, fetched, upserted,
        fetchMs, upsertMs, totalMs: Date.now() - opStart,
        firstUpsertErr,
      });
    } catch (e) {
      results.push({ op, error: (e as Error).message, elapsedMs: Date.now() - opStart, page });
    }
    if (Date.now() - overallStart > 270000) {
      results.push({ note: "270s 한도 도달 — 측정 중단" });
      break;
    }
  }

  return NextResponse.json({
    range: `${twoDaysAgo} ~ ${today}`,
    totalElapsedMs: Date.now() - overallStart,
    operations: results,
  });
}
