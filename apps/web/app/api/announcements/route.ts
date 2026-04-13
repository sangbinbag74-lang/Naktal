import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  g2bFetchAnnouncementPage,
  g2bParseDate,
  g2bExtractRegion,
  g2bGetCategory,
  toYMD,
  type G2BAnnouncement,
} from "@/lib/g2b";
import { CATEGORY_GROUPS, parseSubCategories } from "@/lib/category-map";

export const maxDuration = 60;

// ─── G2B API 직접 조회 (실시간) ───────────────────────────────────────────────
// 최근 3일치 공고 조회 — 용역/시설공사/물품 3개 타입 모두 수집
const NTCE_OPS_WEB = [
  "getBidPblancListInfoServc",
  "getBidPblancListInfoCnstwk",
  "getBidPblancListInfoThng",
] as const;

async function fetchFromG2B(): Promise<{ item: G2BAnnouncement; operation: string }[]> {
  const nowTime = Date.now();
  const inqryBgnDt = toYMD(new Date(nowTime - 3 * 86400000)) + "0000";
  const inqryEndDt = toYMD(new Date()) + "2359";

  const items: { item: G2BAnnouncement; operation: string }[] = [];
  for (const operation of NTCE_OPS_WEB) {
    for (let p = 1; p <= 5; p++) {
      const result = await g2bFetchAnnouncementPage({
        pageNo: p, numOfRows: 100, inqryBgnDt, inqryEndDt, operation,
      });
      items.push(...result.items.map(item => ({ item, operation })));
      if (result.items.length < 100) break;
    }
  }
  return items;
}

// ─── GET /api/announcements ───────────────────────────────────────────────────
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  const category       = searchParams.get("category") ?? "";
  const categoryGroup  = searchParams.get("categoryGroup") ?? "";
  const rawCategories  = (searchParams.get("categories") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  // categoryGroup 확장: 해당 그룹의 모든 category 포함
  if (categoryGroup && categoryGroup in CATEGORY_GROUPS) {
    const groupCats = CATEGORY_GROUPS[categoryGroup as keyof typeof CATEGORY_GROUPS] ?? [];
    for (const cat of groupCats) {
      if (!rawCategories.includes(cat)) rawCategories.push(cat);
    }
  }
  const categories     = rawCategories.join(",");    // fetchFromDB에 전달
  const region         = searchParams.get("region") ?? "";       // 하위호환 단일 지역
  const regions        = searchParams.get("regions") ?? "";      // 쉼표 구분 다중 지역
  const minBudget      = searchParams.get("minBudget") ?? "";
  const maxBudget      = searchParams.get("maxBudget") ?? "";
  const keyword        = searchParams.get("keyword") ?? "";
  const contractMethod = searchParams.get("contractMethod") ?? "";
  const deadlineRange  = searchParams.get("deadlineRange") ?? "";
  const konepsId       = searchParams.get("konepsId") ?? "";
  const prtcptnLmt     = searchParams.get("prtcptnLmt") ?? "";
  const rgnType        = searchParams.get("rgnType") ?? "";
  const ntceKind       = searchParams.get("ntceKind") ?? "";
  const sort           = searchParams.get("sort") ?? "latest";
  const page           = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit          = Math.min(50, parseInt(searchParams.get("limit") ?? "20", 10));

  // G2B 최신 데이터 DB에 백그라운드 동기화 (응답에는 사용 안 함)
  fetchFromG2B()
    .then(pairs => { if (pairs.length > 0) upsertG2BItemsToDB(pairs).catch(() => {}); })
    .catch(() => {});

  // DB에서 조회 (673K+ 데이터 활용)
  return fetchFromDB({ category, categories, region, regions, minBudget, maxBudget, keyword,
    contractMethod, deadlineRange, konepsId, prtcptnLmt, rgnType, ntceKind, sort, page, limit });
}

// ─── G2B 아이템 DB 저장 (상세 페이지 조회용) ──────────────────────────────────
async function upsertG2BItemsToDB(pairs: { item: G2BAnnouncement; operation: string }[]): Promise<void> {
  const admin = createAdminClient();
  const rows = pairs.map(({ item: i, operation }) => {
    const rawJson: Record<string, string> = {};
    for (const [k, v] of Object.entries(i)) rawJson[k] = String(v ?? "");
    const budgetNum = +(i.asignBdgtAmt || i.presmptPrce || "0").replace(/[^0-9]/g, "");
    const deadline  = g2bParseDate(i.bidClseDt);
    const konepsId  = i.bidNtceNo?.trim();
    const title     = i.bidNtceNm?.trim();
    const orgName   = (i.ntceInsttNm || i.demInsttNm)?.trim();
    if (!konepsId || !title || !orgName || !deadline) return null;
    return {
      konepsId, title, orgName,
      budget: budgetNum,
      deadline,
      category: g2bGetCategory(i, operation),
      region: g2bExtractRegion(i.ntceInsttAddr || i.ntceInsttNm || i.demInsttNm || ""),
      rawJson,
      subCategories: operation === "getBidPblancListInfoCnstwk" ? parseSubCategories(rawJson) : [],
    };
  }).filter(Boolean);

  if (rows.length === 0) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin.from("Announcement") as any).upsert(rows, { onConflict: "konepsId" });
}

// ─── G2B 결과 처리 ────────────────────────────────────────────────────────────
function buildG2BResponse(allItems: G2BAnnouncement[], opts: Record<string, string | number>) {
  const { category, region, minBudget, maxBudget, keyword, contractMethod,
    deadlineRange, konepsId, prtcptnLmt, rgnType, ntceKind, sort } = opts as Record<string, string>;
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
  if (contractMethod) filtered = filtered.filter(i =>
    (i.bidMthdNm||i.cntrctMthdNm||"").toLowerCase().includes(contractMethod.toLowerCase()));
  if (prtcptnLmt)     filtered = filtered.filter(i => (i.prtcptnLmtNm||"").includes(prtcptnLmt));
  if (rgnType === "전국")  filtered = filtered.filter(i => !(i.prtcptnLmtNm||"").trim() || (i.prtcptnLmtNm||"").includes("전국"));
  if (rgnType === "관내")  filtered = filtered.filter(i => (i.prtcptnLmtNm||"").includes("관내"));
  if (rgnType === "도")    filtered = filtered.filter(i => /도/.test(i.prtcptnLmtNm||"") && !/시/.test(i.prtcptnLmtNm||""));
  if (rgnType === "시")    filtered = filtered.filter(i => /시/.test(i.prtcptnLmtNm||""));
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
      region: g2bExtractRegion(i.ntceInsttAddr || i.ntceInsttNm || i.demInsttNm || ""),
      rawJson, createdAt: g2bParseDate(i.bidNtceDt) ?? "",
    };
  });

  return NextResponse.json({ data, total, hasMore: offset + limit < total, page, limit });
}

// ─── DB 폴백 ──────────────────────────────────────────────────────────────────
const PROVINCE_CODES = ["서울","부산","대구","인천","광주","대전","울산","세종",
  "경기","강원","충북","충남","전북","전남","경북","경남","제주"];

async function fetchFromDB(opts: Record<string, string | number>): Promise<NextResponse> {
  const { category, categories, region, regions, minBudget, maxBudget, keyword, contractMethod,
    deadlineRange, konepsId, prtcptnLmt, rgnType, ntceKind, sort } = opts as Record<string, string>;
  const page  = Number(opts.page);
  const limit = Number(opts.limit);
  const offset = (page - 1) * limit;

  const admin = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = admin.from("Announcement").select(
    "id,konepsId,title,orgName,budget,deadline,category,subCategories,region,createdAt,rawJson"
  );

  if (categories) {
    const cats = categories.split(",").map(c => c.trim()).filter(Boolean);
    if (cats.length > 0) {
      // 주종(category.in) + 부종(subCategories.overlaps) 각각 ID 조회 후 합집합
      // PostgREST .or() 내부에서 배열 연산자 미지원 → 병렬 쿼리로 우회
      const [mainRes, subRes] = await Promise.all([
        admin.from("Announcement").select("id")
          .in("category", cats).limit(5000),
        admin.from("Announcement").select("id")
          .overlaps("subCategories", cats).limit(5000),
      ]);
      const allIds = Array.from(new Set([
        ...(mainRes.data ?? []).map((d: { id: string }) => d.id),
        ...(subRes.data ?? []).map((d: { id: string }) => d.id),
      ]));

      if (allIds.length === 0) {
        return NextResponse.json({ data: [], total: 0, hasMore: false, page, limit });
      }

      // allIds가 800개 초과면 800개로 제한 (PostgREST URL 길이 초과 방지)
      q = q.in("id", allIds.length > 800 ? allIds.slice(0, 800) : allIds);
    }
  } else if (category) {
    q = q.or(`category.ilike.%${category}%,rawJson->>pubPrcrmntMidClsfcNm.ilike.%${category}%,rawJson->>pubPrcrmntLrgClsfcNm.ilike.%${category}%`);
  }
  if (regions) {
    const all = regions.split(",").map((r: string) => r.trim()).filter(Boolean);
    const provinces = all.filter((r: string) => PROVINCE_CODES.includes(r));
    const cities    = all.filter((r: string) => !PROVINCE_CODES.includes(r));
    if (provinces.length && cities.length === 0) {
      // province만: 인덱스 컬럼 .in() 직접 사용 (가장 안정적)
      q = q.in("region", provinces);
    } else if (cities.length && provinces.length === 0) {
      // city만: JSONB ilike OR
      q = q.or(cities.map((c: string) => `rawJson->>ntceInsttAddr.ilike.%${c}%`).join(","));
    } else if (provinces.length && cities.length) {
      // 혼합: province in + city ilike OR 결합
      const orParts: string[] = [`region.in.(${provinces.join(",")})`];
      cities.forEach((c: string) => orParts.push(`rawJson->>ntceInsttAddr.ilike.%${c}%`));
      q = q.or(orParts.join(","));
    }
  } else if (region) {
    q = q.filter("rawJson->>ntceInsttAddr", "ilike", `%${region}%`);
  }
  if (keyword)        q = q.or(`title.ilike.%${keyword}%,orgName.ilike.%${keyword}%`);
  if (minBudget)      q = q.gte("budget", minBudget);
  if (maxBudget)      q = q.lte("budget", maxBudget);
  if (contractMethod) q = q.or(`rawJson->>bidMthdNm.ilike.%${contractMethod}%,rawJson->>cntrctMthdNm.ilike.%${contractMethod}%`);
  if (konepsId)       q = q.ilike("konepsId", `%${konepsId}%`);
  if (prtcptnLmt)     q = q.filter("rawJson->>prtcptnLmtNm", "ilike", `%${prtcptnLmt}%`);
  if (rgnType === "전국") {
    q = q.or("rawJson->>prtcptnLmtNm.eq.,rawJson->>prtcptnLmtNm.ilike.%전국%");
  } else if (rgnType === "관내") {
    q = q.filter("rawJson->>prtcptnLmtNm", "ilike", "%관내%");
  } else if (rgnType === "도") {
    // 도 단위: 도 포함, 시는 미포함 (예: "경기도" 제한, "경기도 수원시" 제외)
    q = q.filter("rawJson->>prtcptnLmtNm", "ilike", "%도%")
         .not("rawJson->>prtcptnLmtNm", "ilike", "%시%");
  } else if (rgnType === "시") {
    q = q.filter("rawJson->>prtcptnLmtNm", "ilike", "%시%");
  }
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
