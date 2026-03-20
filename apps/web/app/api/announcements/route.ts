import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  g2bFetchAnnouncementPage,
  g2bExtractRegion,
  g2bParseDate,
  toYMD,
  daysAgo,
  type G2BAnnouncement,
} from "@/lib/g2b";

// ─── G2B → DB upsert (최근 N일치) ────────────────────────────────────────────
async function syncRecentFromG2B(days: number): Promise<number> {
  const admin = createAdminClient();
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
      await admin.from("Announcement").upsert(rows, { onConflict: "konepsId" });
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

  const category       = searchParams.get("category") ?? "";
  const region         = searchParams.get("region") ?? "";
  const minBudget      = searchParams.get("minBudget") ?? "";
  const maxBudget      = searchParams.get("maxBudget") ?? "";
  const sort           = searchParams.get("sort") ?? "latest";
  const keyword        = searchParams.get("keyword") ?? "";
  const contractMethod = searchParams.get("contractMethod") ?? "";
  const deadlineRange  = searchParams.get("deadlineRange") ?? "";
  const page           = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit          = Math.min(50, parseInt(searchParams.get("limit") ?? "20", 10));
  const offset         = (page - 1) * limit;

  const supabase = await createClient();
  const hasFilter = !!(category || region || keyword || minBudget || maxBudget || contractMethod || deadlineRange);

  // 날짜 경계값
  const now = new Date();
  const nowIso     = now.toISOString();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
  const d3later    = new Date(now.getTime() +  3 * 86400000).toISOString();
  const d7later    = new Date(now.getTime() +  7 * 86400000).toISOString();
  const d30later   = new Date(now.getTime() + 30 * 86400000).toISOString();

  // ── DB 조회 ──────────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildQuery = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase.from("Announcement").select("*", { count: "exact" });
    if (category)  q = q.ilike("category", `%${category}%`);
    if (region)    q = q.eq("region", region);
    if (keyword)   q = q.or(`title.ilike.%${keyword}%,orgName.ilike.%${keyword}%`);
    if (minBudget) q = q.gte("budget", minBudget);
    if (maxBudget) q = q.lte("budget", maxBudget);
    if (contractMethod) q = q.filter("rawJson->>cntrctMthdNm", "ilike", `%${contractMethod}%`);
    if (deadlineRange === "today") { q = q.gte("deadline", nowIso).lte("deadline", endOfToday); }
    else if (deadlineRange === "3")  { q = q.gte("deadline", nowIso).lte("deadline", d3later); }
    else if (deadlineRange === "7")  { q = q.gte("deadline", nowIso).lte("deadline", d7later); }
    else if (deadlineRange === "30") { q = q.gte("deadline", nowIso).lte("deadline", d30later); }
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

  // ── on-demand G2B fetch (6초 타임아웃) ───────────────────────────────────────
  const shouldSync = page === 1 && ((count ?? 0) === 0 || (hasFilter && (count ?? 0) < 5));

  if (shouldSync) {
    try {
      const days = hasFilter ? 30 : 7;
      await Promise.race([
        syncRecentFromG2B(days),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("sync_timeout")), 6000)
        ),
      ]);
      console.log(`[on-demand G2B sync] ${days}일치 저장 완료`);

      const { data: fresh, count: freshCount } = await buildQuery();
      return NextResponse.json({
        data: fresh ?? [],
        total: freshCount ?? 0,
        hasMore: offset + limit < (freshCount ?? 0),
        page, limit,
      });
    } catch (syncErr) {
      console.error("[on-demand G2B sync 실패/타임아웃]", (syncErr as Error).message);
    }
  }

  return NextResponse.json({
    data: data ?? [],
    total: count ?? 0,
    hasMore: offset + limit < (count ?? 0),
    page, limit,
  });
}
