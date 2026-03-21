import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

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

  const admin = createAdminClient();

  const now = new Date();
  const nowIso     = now.toISOString();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
  const d3later    = new Date(now.getTime() +  3 * 86400000).toISOString();
  const d7later    = new Date(now.getTime() +  7 * 86400000).toISOString();
  const d30later   = new Date(now.getTime() + 30 * 86400000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = admin.from("Announcement").select("*", { count: "exact" });
  if (category)  q = q.ilike("category", `%${category}%`);
  if (region)    q = q.filter("rawJson->>ntceInsttAddr", "ilike", `%${region}%`);
  if (keyword)   q = q.or(`title.ilike.%${keyword}%,orgName.ilike.%${keyword}%`);
  if (minBudget) q = q.gte("budget", minBudget);
  if (maxBudget) q = q.lte("budget", maxBudget);
  if (contractMethod) q = q.filter("rawJson->>cntrctMthdNm", "ilike", `%${contractMethod}%`);
  if (deadlineRange === "today") { q = q.gte("deadline", nowIso).lte("deadline", endOfToday); }
  else if (deadlineRange === "3")  { q = q.gte("deadline", nowIso).lte("deadline", d3later); }
  else if (deadlineRange === "7")  { q = q.gte("deadline", nowIso).lte("deadline", d7later); }
  else if (deadlineRange === "30") { q = q.gte("deadline", nowIso).lte("deadline", d30later); }
  else { q = q.gte("deadline", nowIso); } // 기본: 마감된 공고 제외
  q = sort === "deadline"
    ? q.order("deadline", { ascending: true })
    : q.order("createdAt", { ascending: false });
  q = q.range(offset, offset + limit - 1);

  const { data, count, error } = await q;

  if (error) {
    console.error("[GET /api/announcements]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: data ?? [],
    total: count ?? 0,
    hasMore: offset + limit < (count ?? 0),
    page, limit,
  });
}
