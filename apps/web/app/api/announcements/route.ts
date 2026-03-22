import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  g2bFetchAnnouncementPage,
  g2bParseDate,
  g2bExtractRegion,
  toYMD,
  type G2BAnnouncement,
} from "@/lib/g2b";

export const maxDuration = 60;

// ─── G2B API 직접 조회 (실시간) ───────────────────────────────────────────────
async function fetchFromG2B(): Promise<G2BAnnouncement[]> {
  const nowTime = Date.now();
  const inqryBgnDt = toYMD(new Date(nowTime - 30 * 86400000)) + "0000";
  const inqryEndDt = toYMD(new Date()) + "2359";

  const items: G2BAnnouncement[] = [];
  for (let p = 1; p <= 3; p++) {
    const result = await g2bFetchAnnouncementPage({
      pageNo: p, numOfRows: 100, inqryBgnDt, inqryEndDt,
    });
    items.push(...result.items);
    if (result.items.length < 100) break;
  }
  return items;
}

// ─── GET /api/announcements ───────────────────────────────────────────────────
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  const category       = searchParams.get("category") ?? "";
  const region         = searchParams.get("region") ?? "";
  const minBudget      = searchParams.get("minBudget") ?? "";
  const maxBudget      = searchParams.get("maxBudget") ?? "";
  const keyword        = searchParams.get("keyword") ?? "";
  const contractMethod = searchParams.get("contractMethod") ?? "";
  const deadlineRange  = searchParams.get("deadlineRange") ?? "";
  const konepsId       = searchParams.get("konepsId") ?? "";
  const prtcptnLmt     = searchParams.get("prtcptnLmt") ?? "";
  const ntceKind       = searchParams.get("ntceKind") ?? "";
  const sort           = searchParams.get("sort") ?? "latest";
  const page           = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit          = Math.min(50, parseInt(searchParams.get("limit") ?? "20", 10));

  // ── 1순위: G2B API 실시간 ─────────────────────────────────────────────────
  try {
    const g2bItems = await fetchFromG2B();
    if (g2bItems.length > 0) {
      return buildG2BResponse(g2bItems, { category, region, minBudget, maxBudget, keyword,
        contractMethod, deadlineRange, konepsId, prtcptnLmt, ntceKind, sort, page, limit });
    }
  } catch (e) {
    console.error("[announcements] G2B API 실패, DB 폴백:", String(e));
  }

  // ── 2순위: Supabase DB 폴백 ───────────────────────────────────────────────
  return fetchFromDB({ category, region, minBudget, maxBudget, keyword,
    contractMethod, deadlineRange, konepsId, prtcptnLmt, ntceKind, sort, page, limit });
}

// ─── G2B 결과 처리 ────────────────────────────────────────────────────────────
function buildG2BResponse(allItems: G2BAnnouncement[], opts: Record<string, string | number>) {
  const { category, region, minBudget, maxBudget, keyword, contractMethod,
    deadlineRange, konepsId, prtcptnLmt, ntceKind, sort } = opts as Record<string, string>;
  const page  = Number(opts.page);
  const limit = Number(opts.limit);
  const now = Date.now();

  let filtered = allItems;
  if (konepsId)       filtered = filtered.filter(i => i.bidNtceNo?.includes(konepsId));
  if (category)       { const kw = category.toLowerCase(); filtered = filtered.filter(i =>
    i.bidNtceNm?.toLowerCase().includes(kw) || i.indutyCtgryNm?.toLowerCase().includes(kw) ||
    i.ntceKindNm?.toLowerCase().includes(kw)); }
  if (keyword)        { const kw = keyword.toLowerCase(); filtered = filtered.filter(i =>
    i.bidNtceNm?.toLowerCase().includes(kw) || (i.ntceInsttNm||"").toLowerCase().includes(kw)); }
  if (region)         filtered = filtered.filter(i => (i.ntceInsttAddr||"").toLowerCase().includes(region.toLowerCase()));
  if (contractMethod) filtered = filtered.filter(i => (i.cntrctMthdNm||"").toLowerCase().includes(contractMethod.toLowerCase()));
  if (prtcptnLmt)     filtered = filtered.filter(i => (i.prtcptnLmtNm||"").includes(prtcptnLmt));
  if (ntceKind)       filtered = filtered.filter(i => (i.ntceKindNm||"").toLowerCase().includes(ntceKind.toLowerCase()));
  if (minBudget) { const min = +minBudget; filtered = filtered.filter(i =>
    +(i.asignBdgtAmt||i.presmptPrce||"0").replace(/[^0-9]/g,"") >= min); }
  if (maxBudget) { const max = +maxBudget; filtered = filtered.filter(i =>
    +(i.asignBdgtAmt||i.presmptPrce||"0").replace(/[^0-9]/g,"") <= max); }

  if (deadlineRange) {
    const ends: Record<string, number> = {
      today: new Date(new Date().setHours(23,59,59,0)).getTime(),
      "3":   now + 3 * 86400000, "7": now + 7 * 86400000, "30": now + 30 * 86400000,
    };
    const end = ends[deadlineRange];
    if (end) filtered = filtered.filter(i => {
      const t = new Date(g2bParseDate(i.bidClseDt) ?? 0).getTime();
      return t >= now && t <= end;
    });
  }

  if (sort === "deadline") {
    filtered.sort((a, b) => (g2bParseDate(a.bidClseDt)??"").localeCompare(g2bParseDate(b.bidClseDt)??""));
  } else {
    filtered.sort((a, b) => (b.bidNtceDt??"").localeCompare(a.bidNtceDt??""));
  }

  const total  = filtered.length;
  const offset = (page - 1) * limit;
  const data   = filtered.slice(offset, offset + limit).map(i => {
    const rawJson: Record<string,string> = {};
    for (const [k, v] of Object.entries(i)) rawJson[k] = String(v ?? "");
    return {
      id: i.bidNtceNo, konepsId: i.bidNtceNo, title: i.bidNtceNm ?? "",
      orgName: i.ntceInsttNm || i.demInsttNm || "",
      budget: +(i.asignBdgtAmt||i.presmptPrce||"0").replace(/[^0-9]/g,""),
      deadline: g2bParseDate(i.bidClseDt) ?? "",
      category: i.indutyCtgryNm || i.ntceKindNm || "",
      region: g2bExtractRegion(i.ntceInsttAddr || ""),
      rawJson, createdAt: g2bParseDate(i.bidNtceDt) ?? "",
    };
  });

  return NextResponse.json({ data, total, hasMore: offset + limit < total, page, limit });
}

// ─── DB 폴백 ──────────────────────────────────────────────────────────────────
async function fetchFromDB(opts: Record<string, string | number>): Promise<NextResponse> {
  const { category, region, minBudget, maxBudget, keyword, contractMethod,
    deadlineRange, konepsId, prtcptnLmt, ntceKind, sort } = opts as Record<string, string>;
  const page  = Number(opts.page);
  const limit = Number(opts.limit);
  const offset = (page - 1) * limit;

  const admin = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = admin.from("Announcement").select("*", { count: "exact" });

  if (category)       q = q.or(`category.ilike.%${category}%,title.ilike.%${category}%`);
  if (region)         q = q.filter("rawJson->>ntceInsttAddr", "ilike", `%${region}%`);
  if (keyword)        q = q.or(`title.ilike.%${keyword}%,orgName.ilike.%${keyword}%`);
  if (minBudget)      q = q.gte("budget", minBudget);
  if (maxBudget)      q = q.lte("budget", maxBudget);
  if (contractMethod) q = q.filter("rawJson->>cntrctMthdNm", "ilike", `%${contractMethod}%`);
  if (konepsId)       q = q.ilike("konepsId", `%${konepsId}%`);
  if (prtcptnLmt)     q = q.filter("rawJson->>prtcptnLmtNm", "ilike", `%${prtcptnLmt}%`);
  if (ntceKind)       q = q.filter("rawJson->>ntceKindNm", "ilike", `%${ntceKind}%`);

  if (deadlineRange === "today") {
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
    q = q.gte("deadline", nowIso).lte("deadline", endOfToday);
  } else if (deadlineRange === "3")  { q = q.gte("deadline", nowIso).lte("deadline", new Date(Date.now() + 3*86400000).toISOString()); }
  else if (deadlineRange === "7")  { q = q.gte("deadline", nowIso).lte("deadline", new Date(Date.now() + 7*86400000).toISOString()); }
  else if (deadlineRange === "30") { q = q.gte("deadline", nowIso).lte("deadline", new Date(Date.now() + 30*86400000).toISOString()); }

  q = sort === "deadline"
    ? q.order("deadline", { ascending: true })
    : q.order("createdAt", { ascending: false });
  q = q.range(offset, offset + limit - 1);

  const { data, count, error } = await q;
  if (error) {
    console.error("[announcements DB]", error.message);
    return NextResponse.json({ data: [], total: 0, hasMore: false, page, limit });
  }
  return NextResponse.json({
    data: data ?? [], total: count ?? 0,
    hasMore: offset + limit < (count ?? 0), page, limit,
  });
}
