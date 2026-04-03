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
// 최근 3일치 공고 조회 → 대부분 마감이 미래인 진행중 공고
async function fetchFromG2B(): Promise<G2BAnnouncement[]> {
  const nowTime = Date.now();
  const inqryBgnDt = toYMD(new Date(nowTime - 3 * 86400000)) + "0000";
  const inqryEndDt = toYMD(new Date()) + "2359";

  const items: G2BAnnouncement[] = [];
  for (let p = 1; p <= 5; p++) {
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

  // G2B 최신 데이터 DB에 백그라운드 동기화 (응답에는 사용 안 함)
  fetchFromG2B()
    .then(items => { if (items.length > 0) upsertG2BItemsToDB(items).catch(() => {}); })
    .catch(() => {});

  // DB에서 조회 (673K+ 데이터 활용)
  return fetchFromDB({ category, region, minBudget, maxBudget, keyword,
    contractMethod, deadlineRange, konepsId, prtcptnLmt, ntceKind, sort, page, limit });
}

// ─── G2B 아이템 DB 저장 (상세 페이지 조회용) ──────────────────────────────────
async function upsertG2BItemsToDB(items: G2BAnnouncement[]): Promise<void> {
  const admin = createAdminClient();
  const rows = items.map(i => {
    const rawJson: Record<string, string> = {};
    for (const [k, v] of Object.entries(i)) rawJson[k] = String(v ?? "");
    const budgetNum = +(i.asignBdgtAmt || i.presmptPrce || "0").replace(/[^0-9]/g, "");
    const deadline  = g2bParseDate(i.bidClseDt);
    const konepsId  = i.bidNtceNo?.trim();
    const title     = i.bidNtceNm?.trim();
    const orgName   = (i.ntceInsttNm || i.demInsttNm)?.trim();
    if (!konepsId || !title || !orgName || !deadline) return null;
    return {
      id: crypto.randomUUID(),
      konepsId, title, orgName,
      budget: budgetNum,
      deadline,
      category: i.pubPrcrmntMidClsfcNm || i.pubPrcrmntLrgClsfcNm || i.ntceKindNm || "",
      region: g2bExtractRegion(i.ntceInsttAddr || ""),
      rawJson,
    };
  }).filter(Boolean);

  if (rows.length === 0) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin.from("Announcement") as any).upsert(rows, { onConflict: "konepsId" });
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

  // 취소 공고 항상 제외
  filtered = filtered.filter(i => !(i.ntceKindNm ?? "").includes("취소"));

  if (deadlineRange === "active") {
    // 진행중: 마감일이 현재 이후인 공고만
    filtered = filtered.filter(i => {
      const t = new Date(g2bParseDate(i.bidClseDt) ?? 0).getTime();
      return t >= now;
    });
  } else if (deadlineRange) {
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
      category: i.pubPrcrmntMidClsfcNm || i.pubPrcrmntLrgClsfcNm || i.ntceKindNm || "",
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
  let q: any = admin.from("Announcement").select(
    "id,konepsId,title,orgName,budget,deadline,category,region,createdAt,rawJson"
  );

  if (category)       q = q.or(`category.ilike.%${category}%,title.ilike.%${category}%,rawJson->>pubPrcrmntMidClsfcNm.ilike.%${category}%,rawJson->>pubPrcrmntLrgClsfcNm.ilike.%${category}%`);
  if (region)         q = q.filter("rawJson->>ntceInsttAddr", "ilike", `%${region}%`);
  if (keyword)        q = q.or(`title.ilike.%${keyword}%,orgName.ilike.%${keyword}%`);
  if (minBudget)      q = q.gte("budget", minBudget);
  if (maxBudget)      q = q.lte("budget", maxBudget);
  if (contractMethod) q = q.filter("rawJson->>cntrctMthdNm", "ilike", `%${contractMethod}%`);
  if (konepsId)       q = q.ilike("konepsId", `%${konepsId}%`);
  if (prtcptnLmt)     q = q.filter("rawJson->>prtcptnLmtNm", "ilike", `%${prtcptnLmt}%`);
  if (ntceKind)       q = q.filter("rawJson->>ntceKindNm", "ilike", `%${ntceKind}%`);

  // 취소 공고 제외: deadline 미래 필터로 대부분 처리됨 (JSONB full scan 방지)

  if (deadlineRange === "active") {
    // 진행중(기본값): 마감일 미래인 공고만
    q = q.gte("deadline", nowIso);
  } else if (deadlineRange === "today") {
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
    q = q.gte("deadline", nowIso).lte("deadline", endOfToday);
  } else if (deadlineRange === "3")  { q = q.gte("deadline", nowIso).lte("deadline", new Date(Date.now() + 3*86400000).toISOString()); }
  else if (deadlineRange === "7")  { q = q.gte("deadline", nowIso).lte("deadline", new Date(Date.now() + 7*86400000).toISOString()); }
  else if (deadlineRange === "30") { q = q.gte("deadline", nowIso).lte("deadline", new Date(Date.now() + 30*86400000).toISOString()); }
  // deadlineRange === "": 전체(마감포함) — 날짜 필터 없음

  q = sort === "deadline"
    ? q.order("deadline", { ascending: true })
    : q.order("createdAt", { ascending: false });
  // limit+1개 가져와서 hasMore 판단 (count 쿼리 제거로 타임아웃 방지)
  q = q.range(offset, offset + limit);

  const { data, error } = await q;
  if (error) {
    console.error("[announcements DB]", error.message, error.hint, error.details);
    return NextResponse.json({ data: [], total: 0, hasMore: false, page, limit, error: error.message });
  }
  const rows = data ?? [];
  const hasMore = rows.length > limit;
  return NextResponse.json({
    data: hasMore ? rows.slice(0, limit) : rows,
    total: offset + rows.length,
    hasMore, page, limit,
  });
}
