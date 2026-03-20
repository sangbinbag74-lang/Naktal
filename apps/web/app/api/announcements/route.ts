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

// ─── G2B → DB upsert ─────────────────────────────────────────────────────────
async function syncFromG2B(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fromDate: string,
  toDate: string,
): Promise<number> {
  let page = 1;
  let saved = 0;

  while (true) {
    const { items, totalCount } = await g2bFetchAnnouncementPage({
      pageNo: page,
      numOfRows: 100,
      inqryBgnDt: `${fromDate}0000`,
      inqryEndDt: `${toDate}2359`,
    });

    if (items.length === 0) break;

    const rows = items
      .map((item: G2BAnnouncement) => {
        const konepsId  = item.bidNtceNo?.trim();
        const title     = item.bidNtceNm?.trim();
        const orgName   = (item.ntceInsttNm || item.demInsttNm)?.trim();
        const budgetNum = parseInt(
          (item.asignBdgtAmt || item.presmptPrce || "0").replace(/[^0-9]/g, ""), 10
        );
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
      })
      .filter(Boolean);

    if (rows.length > 0) {
      const { error } = await supabase
        .from("Announcement")
        .upsert(rows, { onConflict: "konepsId" });
      if (!error) saved += rows.length;
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

  let query = supabase.from("Announcement").select("*", { count: "exact" });
  if (category)  query = query.eq("category", category);
  if (region)    query = query.eq("region", region);
  if (keyword)   query = query.or(`title.ilike.%${keyword}%,orgName.ilike.%${keyword}%`);
  if (minBudget) query = query.gte("budget", minBudget);
  if (maxBudget) query = query.lte("budget", maxBudget);
  query = sort === "deadline"
    ? query.order("deadline", { ascending: true })
    : query.order("createdAt", { ascending: false });
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    console.error("[GET /api/announcements]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // DB가 비어있으면 G2B API에서 즉시 수집 후 반환
  if ((count ?? 0) === 0 && page === 1) {
    try {
      const today   = toYMD(new Date());
      const weekAgo = toYMD(daysAgo(7));
      const saved   = await syncFromG2B(supabase, weekAgo, today);
      console.log(`[on-demand G2B sync] ${saved}건 저장`);

      const { data: fresh, count: freshCount } = await supabase
        .from("Announcement")
        .select("*", { count: "exact" })
        .order("createdAt", { ascending: false })
        .range(0, limit - 1);

      return NextResponse.json({
        data: fresh ?? [],
        total: freshCount ?? 0,
        hasMore: limit < (freshCount ?? 0),
        page: 1,
        limit,
      });
    } catch (syncErr) {
      console.error("[on-demand G2B sync 실패]", syncErr);
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
