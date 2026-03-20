import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  g2bFetchAnnouncementPage,
  g2bExtractRegion,
  g2bParseDate,
  toYMD,
  daysAgo,
  type G2BAnnouncement,
} from "@/lib/g2b";

// ─── G2B → DB upsert (최근 N일치) ────────────────────────────────────────────
async function syncRecentFromG2B(
  supabase: Awaited<ReturnType<typeof createClient>>,
  days: number,
): Promise<number> {
  const today   = toYMD(new Date());
  const fromDay = toYMD(daysAgo(days));
  let page = 1, saved = 0;

  while (true) {
    const { items, totalCount } = await g2bFetchAnnouncementPage({
      pageNo: page, numOfRows: 100,
      inqryBgnDt: `${fromDay}0000`,
      inqryEndDt: `${today}2359`,
    });
    if (items.length === 0) break;

    const rows = items.map((item: G2BAnnouncement) => {
      const konepsId  = item.bidNtceNo?.trim();
      const title     = item.bidNtceNm?.trim();
      const orgName   = (item.ntceInsttNm || item.demInsttNm)?.trim();
      const budgetNum = parseInt(
        (item.asignBdgtAmt || item.presmptPrce || "0").replace(/[^0-9]/g, ""), 10
      );
      const deadline = g2bParseDate(item.bidClseDt);
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
      await supabase.from("Announcement").upsert(rows, { onConflict: "konepsId" });
      saved += rows.length;
    }
    if (page * 100 >= totalCount) break;
    page++;
  }
  return saved;
}

// ─── GET /api/announcements ───────────────────────────────────────────────────
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  const category  = searchParams.get("category") ?? "";
  const region    = searchParams.get("region") ?? "";
  const minBudget = searchParams.get("minBudget");
  const maxBudget = searchParams.get("maxBudget");
  const sort      = searchParams.get("sort") ?? "latest";
  const keyword   = searchParams.get("keyword") ?? "";
  const page      = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit     = Math.min(50, parseInt(searchParams.get("limit") ?? "20", 10));
  const offset    = (page - 1) * limit;

  const supabase = await createClient();
  const hasFilter = !!(category || region || keyword || minBudget || maxBudget);

  // ── DB 조회 ──────────────────────────────────────────────────────────────────
  const buildQuery = () => {
    let q = supabase.from("Announcement").select("*", { count: "exact" });
    if (category)  q = q.eq("category", category);
    if (region)    q = q.eq("region", region);
    if (keyword)   q = q.or(`title.ilike.%${keyword}%,orgName.ilike.%${keyword}%`);
    if (minBudget) q = q.gte("budget", minBudget);
    if (maxBudget) q = q.lte("budget", maxBudget);
    q = sort === "deadline"
      ? q.order("deadline", { ascending: true })
      : q.order("createdAt", { ascending: false });
    return q.range(offset, offset + limit - 1);
  };

  const { data, count, error } = await buildQuery();

  if (error) {
    console.error("[GET /api/announcements]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ── on-demand G2B fetch:
  //    1) DB가 완전히 비어있을 때 (최초 접속)
  //    2) 필터를 적용했는데 결과가 너무 적을 때 (< 5건)
  const shouldSync =
    page === 1 &&
    ((count ?? 0) === 0 ||
      (hasFilter && (count ?? 0) < 5));

  if (shouldSync) {
    try {
      // 필터 조회면 30일치, 첫 접속이면 7일치 수집
      const days = hasFilter ? 30 : 7;
      const saved = await syncRecentFromG2B(supabase, days);
      console.log(`[on-demand G2B sync] ${days}일치 ${saved}건 저장`);

      // 수집 후 동일 쿼리 재실행
      const { data: fresh, count: freshCount } = await buildQuery();
      return NextResponse.json({
        data: fresh ?? [],
        total: freshCount ?? 0,
        hasMore: offset + limit < (freshCount ?? 0),
        page,
        limit,
      });
    } catch (syncErr) {
      console.error("[on-demand G2B sync 실패]", syncErr);
      // 실패해도 기존 결과 반환
    }
  }

  return NextResponse.json({
    data: data ?? [],
    total: count ?? 0,
    hasMore: offset + limit < (count ?? 0),
    page,
    limit,
  });
}
