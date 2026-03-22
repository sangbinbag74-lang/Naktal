import { NextRequest, NextResponse } from "next/server";
import {
  g2bFetchAnnouncementPage,
  g2bParseDate,
  g2bExtractRegion,
  toYMD,
  type G2BAnnouncement,
} from "@/lib/g2b";

// ─── GET /api/announcements — G2B API 실시간 조회 ─────────────────────────────
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

  const now = new Date();
  const nowTime = now.getTime();

  // G2B 조회 날짜 범위: 최근 60일 ~ 앞으로 90일 (공고 등록일 기준)
  const inqryBgnDt = toYMD(new Date(nowTime - 60 * 86400000)) + "0000";
  const inqryEndDt = toYMD(new Date(nowTime + 90 * 86400000)) + "2359";

  // G2B API에서 최대 5페이지(500건) 수집
  const G2B_PAGE_SIZE = 100;
  const MAX_PAGES = 5;
  let allItems: G2BAnnouncement[] = [];
  let g2bTotal = 0;

  try {
    for (let g2bPage = 1; g2bPage <= MAX_PAGES; g2bPage++) {
      const result = await g2bFetchAnnouncementPage({
        pageNo: g2bPage,
        numOfRows: G2B_PAGE_SIZE,
        inqryBgnDt,
        inqryEndDt,
      });
      if (g2bPage === 1) g2bTotal = result.totalCount;
      allItems = [...allItems, ...result.items];
      if (result.items.length < G2B_PAGE_SIZE) break;
    }
  } catch (e) {
    console.error("[GET /api/announcements] G2B API 오류:", e);
    return NextResponse.json({ error: "G2B API 오류" }, { status: 502 });
  }

  // ─── 필터 적용 ───────────────────────────────────────────────────────────────
  let filtered = allItems;

  if (konepsId) {
    filtered = filtered.filter(i => i.bidNtceNo?.includes(konepsId));
  }
  if (category) {
    const kw = category.toLowerCase();
    filtered = filtered.filter(i =>
      i.bidNtceNm?.toLowerCase().includes(kw) ||
      i.indutyCtgryNm?.toLowerCase().includes(kw) ||
      i.ntceKindNm?.toLowerCase().includes(kw)
    );
  }
  if (keyword) {
    const kw = keyword.toLowerCase();
    filtered = filtered.filter(i =>
      i.bidNtceNm?.toLowerCase().includes(kw) ||
      (i.ntceInsttNm || i.demInsttNm || "").toLowerCase().includes(kw)
    );
  }
  if (region) {
    filtered = filtered.filter(i =>
      (i.ntceInsttAddr || "").toLowerCase().includes(region.toLowerCase())
    );
  }
  if (contractMethod) {
    filtered = filtered.filter(i =>
      (i.cntrctMthdNm || "").toLowerCase().includes(contractMethod.toLowerCase())
    );
  }
  if (prtcptnLmt) {
    filtered = filtered.filter(i =>
      (i.prtcptnLmtNm || "").includes(prtcptnLmt)
    );
  }
  if (ntceKind) {
    filtered = filtered.filter(i =>
      (i.ntceKindNm || "").toLowerCase().includes(ntceKind.toLowerCase())
    );
  }
  if (minBudget) {
    const min = parseInt(minBudget, 10);
    filtered = filtered.filter(i => {
      const b = parseInt((i.asignBdgtAmt || i.presmptPrce || "0").replace(/[^0-9]/g, ""), 10);
      return b >= min;
    });
  }
  if (maxBudget) {
    const max = parseInt(maxBudget, 10);
    filtered = filtered.filter(i => {
      const b = parseInt((i.asignBdgtAmt || i.presmptPrce || "0").replace(/[^0-9]/g, ""), 10);
      return b <= max;
    });
  }

  // 마감일 필터
  if (deadlineRange === "today") {
    const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime();
    filtered = filtered.filter(i => {
      const t = new Date(g2bParseDate(i.bidClseDt) ?? 0).getTime();
      return t >= nowTime && t <= endToday;
    });
  } else if (deadlineRange === "3") {
    const end = nowTime + 3 * 86400000;
    filtered = filtered.filter(i => {
      const t = new Date(g2bParseDate(i.bidClseDt) ?? 0).getTime();
      return t >= nowTime && t <= end;
    });
  } else if (deadlineRange === "7") {
    const end = nowTime + 7 * 86400000;
    filtered = filtered.filter(i => {
      const t = new Date(g2bParseDate(i.bidClseDt) ?? 0).getTime();
      return t >= nowTime && t <= end;
    });
  } else if (deadlineRange === "30") {
    const end = nowTime + 30 * 86400000;
    filtered = filtered.filter(i => {
      const t = new Date(g2bParseDate(i.bidClseDt) ?? 0).getTime();
      return t >= nowTime && t <= end;
    });
  }

  // ─── 정렬 ────────────────────────────────────────────────────────────────────
  if (sort === "deadline") {
    filtered.sort((a, b) =>
      (g2bParseDate(a.bidClseDt) ?? "").localeCompare(g2bParseDate(b.bidClseDt) ?? "")
    );
  } else {
    filtered.sort((a, b) => (b.bidNtceDt ?? "").localeCompare(a.bidNtceDt ?? ""));
  }

  // ─── 페이지네이션 ────────────────────────────────────────────────────────────
  const total = filtered.length;
  const offset = (page - 1) * limit;
  const pageItems = filtered.slice(offset, offset + limit);

  // ─── G2B 항목 → Announcement 형태로 변환 ─────────────────────────────────────
  const data = pageItems.map(i => {
    const rawJson: Record<string, string> = {};
    for (const [k, v] of Object.entries(i)) rawJson[k] = String(v ?? "");
    return {
      id:        i.bidNtceNo,
      konepsId:  i.bidNtceNo,
      title:     i.bidNtceNm ?? "",
      orgName:   i.ntceInsttNm || i.demInsttNm || "",
      budget:    parseInt((i.asignBdgtAmt || i.presmptPrce || "0").replace(/[^0-9]/g, ""), 10),
      deadline:  g2bParseDate(i.bidClseDt) ?? "",
      category:  i.indutyCtgryNm || i.ntceKindNm || "",
      region:    g2bExtractRegion(i.ntceInsttAddr || ""),
      rawJson,
      createdAt: g2bParseDate(i.bidNtceDt) ?? "",
    };
  });

  return NextResponse.json({
    data,
    total: total < g2bTotal ? g2bTotal : total,
    hasMore: offset + limit < total,
    page,
    limit,
  });
}
