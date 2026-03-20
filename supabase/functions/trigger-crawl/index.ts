/**
 * Supabase Edge Function: trigger-crawl
 *
 * G2B(나라장터) OpenAPI를 직접 호출해 공고/낙찰결과를 수집하고 DB에 저장합니다.
 * pg_cron에 의해 매일 KST 06:00 / 12:00 / 18:00 자동 실행됩니다.
 * Playwright 불필요 — 순수 HTTP 호출로 서버리스 환경에서 동작합니다.
 *
 * Deploy:
 *   supabase functions deploy trigger-crawl
 *
 * Required secrets (supabase secrets set KEY=VALUE):
 *   G2B_API_KEY      공공데이터포털 G2B API 인증키
 *   SUPABASE_URL     https://xxxx.supabase.co
 *   SERVICE_ROLE_KEY Supabase service_role 키 (DB 쓰기 권한)
 */

const G2B_BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";
const NUM_OF_ROWS = 100;

// ─── 타입 ─────────────────────────────────────────────────────────────────────
interface G2BAnnouncement {
  bidNtceNo: string;
  bidNtceNm: string;
  ntceInsttNm: string;
  demInsttNm: string;
  asignBdgtAmt: string;
  presmptPrce: string;
  bidClseDt: string;
  ntceKindNm: string;
  indutyCtgryNm: string;
  ntceInsttAddr: string;
  [key: string]: string;
}

interface G2BBidResult {
  bidNtceNo: string;
  sucsfbidAmt: string;
  sucsfbidRate: string;
  totPrtcptCo: string;
  [key: string]: string;
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────
function parseItems<T>(items: unknown): T[] {
  if (!items || items === "") return [];
  if (Array.isArray(items)) return items as T[];
  if (typeof items === "object" && items !== null && "item" in items) {
    const item = (items as { item: unknown }).item;
    return Array.isArray(item) ? item as T[] : [item as T];
  }
  return [];
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function parseG2BDate(raw: string): string | null {
  if (!raw || raw.length < 8) return null;
  const y = raw.slice(0, 4), mo = raw.slice(4, 6), d = raw.slice(6, 8);
  const hh = raw.slice(8, 10) || "00", mm = raw.slice(10, 12) || "00";
  const dt = new Date(`${y}-${mo}-${d}T${hh}:${mm}:00+09:00`);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

const REGION_MAP: [string, string][] = [
  ["서울", "서울"], ["부산", "부산"], ["대구", "대구"], ["인천", "인천"],
  ["광주", "광주"], ["대전", "대전"], ["울산", "울산"], ["세종", "세종"],
  ["경기", "경기"], ["강원", "강원"], ["충북", "충북"], ["충남", "충남"],
  ["전북", "전북"], ["전남", "전남"], ["경북", "경북"], ["경남", "경남"],
  ["제주", "제주"],
];

function extractRegion(addr: string): string {
  for (const [p, l] of REGION_MAP) if (addr.startsWith(p)) return l;
  return addr.slice(0, 2);
}

// ─── G2B 공고 수집 ────────────────────────────────────────────────────────────
async function collectAnnouncements(
  apiKey: string,
  supabaseUrl: string,
  serviceRoleKey: string,
  dateStr: string
): Promise<{ saved: number; errors: number }> {
  let page = 1, saved = 0, errors = 0;

  while (true) {
    const url = new URL(`${G2B_BASE}/getBidPblancListInfoServc`);
    url.searchParams.set("serviceKey", apiKey);
    url.searchParams.set("numOfRows", String(NUM_OF_ROWS));
    url.searchParams.set("pageNo", String(page));
    url.searchParams.set("type", "json");
    url.searchParams.set("inqryDiv", "1");
    url.searchParams.set("inqryBgnDt", `${dateStr}0000`);
    url.searchParams.set("inqryEndDt", `${dateStr}2359`);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`G2B 공고 API ${res.status}`);

    const data = await res.json() as { response: { header: { resultCode: string }; body: { items: unknown; totalCount: number } } };
    if (data.response.header.resultCode !== "00") break;

    const items = parseItems<G2BAnnouncement>(data.response.body.items);
    if (items.length === 0) break;

    for (const item of items) {
      const konepsId = item.bidNtceNo?.trim();
      const title    = item.bidNtceNm?.trim();
      const orgName  = (item.ntceInsttNm || item.demInsttNm)?.trim();
      const budgetNum = parseInt((item.asignBdgtAmt || item.presmptPrce || "0").replace(/[^0-9]/g, ""), 10);
      const deadline  = parseG2BDate(item.bidClseDt);

      if (!konepsId || !title || !orgName || !budgetNum || !deadline) continue;

      const rawJson: Record<string, string> = {};
      for (const [k, v] of Object.entries(item)) rawJson[k] = String(v ?? "");

      const r = await fetch(`${supabaseUrl}/rest/v1/Announcement`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Prefer": "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          konepsId,
          title,
          orgName,
          budget: String(budgetNum),
          deadline,
          category: item.ntceKindNm || item.indutyCtgryNm || "",
          region: extractRegion(item.ntceInsttAddr || ""),
          rawJson,
        }),
      });

      if (r.ok) saved++; else errors++;
    }

    if (page * NUM_OF_ROWS >= data.response.body.totalCount) break;
    page++;
  }

  return { saved, errors };
}

// ─── G2B 낙찰결과 수집 ───────────────────────────────────────────────────────
async function collectBidResults(
  apiKey: string,
  supabaseUrl: string,
  serviceRoleKey: string,
  dateStr: string
): Promise<{ saved: number; errors: number }> {
  let page = 1, saved = 0, errors = 0;

  while (true) {
    const url = new URL(`${G2B_BASE}/getSuccBidInquireInfoServc`);
    url.searchParams.set("serviceKey", apiKey);
    url.searchParams.set("numOfRows", String(NUM_OF_ROWS));
    url.searchParams.set("pageNo", String(page));
    url.searchParams.set("type", "json");
    url.searchParams.set("inqryBgnDt", `${dateStr}0000`);
    url.searchParams.set("inqryEndDt", `${dateStr}2359`);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`G2B 낙찰결과 API ${res.status}`);

    const data = await res.json() as { response: { header: { resultCode: string }; body: { items: unknown; totalCount: number } } };
    if (data.response.header.resultCode !== "00") break;

    const items = parseItems<G2BBidResult>(data.response.body.items);
    if (items.length === 0) break;

    for (const item of items) {
      const annId      = item.bidNtceNo?.trim();
      const bidRateRaw = (item.sucsfbidRate || "").replace(/[^0-9.]/g, "");
      const priceRaw   = (item.sucsfbidAmt || "").replace(/[^0-9]/g, "");

      if (!annId || !bidRateRaw || !priceRaw) continue;

      const bidRate    = parseFloat(bidRateRaw).toFixed(4);
      const finalPrice = String(parseInt(priceRaw, 10));
      const numBidders = parseInt((item.totPrtcptCo || "0").replace(/[^0-9]/g, ""), 10);

      const r = await fetch(`${supabaseUrl}/rest/v1/BidResult`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Prefer": "resolution=merge-duplicates",
        },
        body: JSON.stringify({ annId, bidRate, finalPrice, numBidders }),
      });

      if (r.ok) saved++; else errors++;
    }

    if (page * NUM_OF_ROWS >= data.response.body.totalCount) break;
    page++;
  }

  return { saved, errors };
}

// ─── Edge Function 진입점 ─────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const apiKey         = Deno.env.get("G2B_API_KEY");
  const supabaseUrl    = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");

  if (!apiKey || !supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "G2B_API_KEY, SUPABASE_URL, SERVICE_ROLE_KEY 필요" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // 요청 body에서 날짜 받거나 기본값(오늘) 사용
    let dateStr = todayStr();
    try {
      const body = await req.json() as { date?: string };
      if (body.date && /^\d{8}$/.test(body.date)) dateStr = body.date;
    } catch { /* body 없으면 오늘 */ }

    const [annResult, bidResult] = await Promise.all([
      collectAnnouncements(apiKey, supabaseUrl, serviceRoleKey, dateStr),
      collectBidResults(apiKey, supabaseUrl, serviceRoleKey, dateStr),
    ]);

    return new Response(
      JSON.stringify({
        ok: true,
        date: dateStr,
        announcements: annResult,
        bidResults: bidResult,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
