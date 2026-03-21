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
  const konepsId       = searchParams.get("konepsId") ?? "";
  const prtcptnLmt     = searchParams.get("prtcptnLmt") ?? "";
  const ntceKind       = searchParams.get("ntceKind") ?? "";
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
  // category 컬럼엔 ntceKindNm(시설공사/물품/용역)이 저장되고,
  // 실제 업종(토목공사, 건축공사 등)은 rawJson.indutyCtgryNm에 있음.
  // .or() 내 rawJson->> 는 URL 인코딩 문제로 작동 안 함 → .filter() 두 번으로 처리.
  if (category) {
    q = q.filter("rawJson->>indutyCtgryNm", "ilike", `%${category}%`);
  }
  if (region)    q = q.filter("rawJson->>ntceInsttAddr", "ilike", `%${region}%`);
  if (keyword)   q = q.or(`title.ilike.%${keyword}%,orgName.ilike.%${keyword}%`);
  if (minBudget) q = q.gte("budget", minBudget);
  if (maxBudget) q = q.lte("budget", maxBudget);
  if (contractMethod) q = q.filter("rawJson->>cntrctMthdNm", "ilike", `%${contractMethod}%`);
  if (konepsId)       q = q.ilike("konepsId", `%${konepsId}%`);
  if (prtcptnLmt)     q = q.filter("rawJson->>prtcptnLmtNm", "ilike", `%${prtcptnLmt}%`);
  if (ntceKind)       q = q.filter("rawJson->>ntceKindNm", "ilike", `%${ntceKind}%`);
  if (deadlineRange === "today") { q = q.gte("deadline", nowIso).lte("deadline", endOfToday); }
  else if (deadlineRange === "3")  { q = q.gte("deadline", nowIso).lte("deadline", d3later); }
  else if (deadlineRange === "7")  { q = q.gte("deadline", nowIso).lte("deadline", d7later); }
  else if (deadlineRange === "30") { q = q.gte("deadline", nowIso).lte("deadline", d30later); }
  // deadlineRange = "" (전체): 필터 없음 — 마감된 공고 포함 모두 표시
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
