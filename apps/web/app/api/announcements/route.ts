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
import { CATEGORY_GROUPS, SIMILAR_CATEGORIES, parseSubCategories } from "@/lib/category-map";

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

  // categories 파싱
  const cats = categories ? categories.split(",").map(c => c.trim()).filter(Boolean) : [];

  // 시(city) 레벨 지역 필터 감지: province 코드에 없으면 city로 간주
  const regionList = regions ? regions.split(",").map(r => r.trim()).filter(Boolean) : [];
  const citiesInFilter = regionList.filter(r => !PROVINCE_CODES.includes(r));
  const hasCityFilter = citiesInFilter.length > 0;

  // [2026-04-18] RPC search_announcements 경로 비활성화
  //   - 659만 행 DB에서 9초+ 소요 (statement_timeout 유발)
  //   - 모든 필터는 Path B 체인 쿼리 + idx_ann_deadline_createdat 인덱스로 처리 (2초 이내)
  //   - 추후 RPC 함수 최적화 후 재활성화 가능

  // ── 체인 쿼리 (모든 필터 지원) ────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = admin.from("Announcement").select(
    "id,konepsId,title,orgName,budget,deadline,category,subCategories,region,createdAt,rawJson,aValueYn"
  );

  // 다중 카테고리: category(주종) OR subCategories(부종) OR 유사 업종 확장
  if (cats.length > 0) {
    const expanded = new Set<string>(cats);
    for (const c of cats) {
      (SIMILAR_CATEGORIES[c] ?? []).forEach((s) => expanded.add(s));
    }
    const list = [...expanded];
    const orParts: string[] = [];
    // category 주종 매칭
    orParts.push(`category.in.(${list.join(",")})`);
    // subCategories 부종 배열 contains (PostgreSQL array)
    for (const c of list) {
      orParts.push(`subCategories.cs.{${c}}`);
    }
    q = q.or(orParts.join(","));
  } else if (category) {
    q = q.or(`category.ilike.%${category}%,rawJson->>pubPrcrmntMidClsfcNm.ilike.%${category}%,rawJson->>pubPrcrmntLrgClsfcNm.ilike.%${category}%`);
  }
  if (regions) {
    const all = regions.split(",").map((r: string) => r.trim()).filter(Boolean);
    const provinces = all.filter((r: string) => PROVINCE_CODES.includes(r));
    const cities    = all.filter((r: string) => !PROVINCE_CODES.includes(r));
    if (provinces.length && cities.length === 0) {
      q = q.in("region", provinces);
    } else if (cities.length && provinces.length === 0) {
      q = q.or(cities.map((c: string) => `rawJson->>ntceInsttAddr.ilike.%${c}%`).join(","));
    } else if (provinces.length && cities.length) {
      const orParts: string[] = [`region.in.(${provinces.join(",")})`];
      cities.forEach((c: string) => orParts.push(`rawJson->>ntceInsttAddr.ilike.%${c}%`));
      q = q.or(orParts.join(","));
    }
  } else if (region) {
    q = q.filter("rawJson->>ntceInsttAddr", "ilike", `%${region}%`);
  }
  if (keyword) {
    const words = keyword.trim().split(/\s+/).filter(Boolean);
    for (const word of words) {
      q = q.or(`title.ilike.%${word}%,orgName.ilike.%${word}%`);
    }
  }
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
    q = q.filter("rawJson->>prtcptnLmtNm", "ilike", "%도%")
         .not("rawJson->>prtcptnLmtNm", "ilike", "%시%");
  } else if (rgnType === "시") {
    q = q.filter("rawJson->>prtcptnLmtNm", "ilike", "%시%");
  }
  if (ntceKind)       q = q.filter("rawJson->>ntceKindNm", "ilike", `%${ntceKind}%`);

  if (deadlineRange === "active") {
    q = q.gte("deadline", nowIso);
  } else if (deadlineRange === "today") {
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
    q = q.gte("deadline", nowIso).lte("deadline", endOfToday);
  } else if (deadlineRange === "3")  { q = q.gte("deadline", nowIso).lte("deadline", new Date(Date.now() + 3*86400000).toISOString()); }
  else if (deadlineRange === "7")  { q = q.gte("deadline", nowIso).lte("deadline", new Date(Date.now() + 7*86400000).toISOString()); }
  else if (deadlineRange === "30") { q = q.gte("deadline", nowIso).lte("deadline", new Date(Date.now() + 30*86400000).toISOString()); }

  q = sort === "deadline"
    ? q.order("deadline", { ascending: true })
    : q.order("createdAt", { ascending: false });
  q = q.range(offset, offset + limit);

  const { data, error } = await q;
  if (error) {
    console.error("[announcements DB]", error.message, error.hint, error.details);
    return NextResponse.json({ data: [], total: 0, hasMore: false, page, limit, error: error.message });
  }
  const rows = data ?? [];

  // 단일 단어 키워드 0건 → 공백 무시 RPC fallback
  if (keyword && !keyword.includes(" ") && rows.length === 0) {
    const { data: fuzzy } = await admin.rpc("search_ann_nospace", {
      p_keyword:      keyword,
      p_deadline_gte: deadlineRange === "active" ? nowIso : null,
      p_limit:        limit,
      p_offset:       offset,
    });
    return NextResponse.json({ data: fuzzy ?? [], total: fuzzy?.length ?? 0, hasMore: false, page, limit });
  }

  const hasMore = rows.length > limit;
  return NextResponse.json({
    data: hasMore ? rows.slice(0, limit) : rows,
    total: offset + rows.length,
    hasMore, page, limit,
  });
}
