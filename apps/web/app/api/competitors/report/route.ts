/**
 * 경쟁사·발주처 심층 분석 리포트 (2026-07-10) — 요금제 광고 "경쟁사·발주처 심층 분석" 실물화
 *
 * GET /api/competitors/report?type=company&name=대한건설
 * GET /api/competitors/report?type=org&name=조달청
 *
 *  - PRO 이상 전용 (grandfathered = 영구 PRO), 서버 집행
 *  - 데이터: BidResult(개찰 완료 낙찰 결과, 532만 건) × Announcement(기초금액·발주처) 조인
 *  - 개찰 후 공개 데이터만 사용 — 박상빈님 데이터 0 노출 원칙 정합
 *  - winnerName 인덱스 생성 전에는 검색 6~10초 (maxDuration 30 내) — 인덱스 승인 시 ms급
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { canAccess, Feature } from "@/lib/plan-guard";
import { rateLimit } from "@/lib/rate-limit";
import type { Plan } from "@naktal/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface ResultRow {
  annId: string;
  bidRate: string | number | null;
  finalPrice: string | number | null;
  numBidders: number | null;
  winnerName: string | null;
  openedAt: string | null;
}
interface AnnRow {
  konepsId: string;
  title: string | null;
  orgName: string | null;
  category: string | null;
  region: string | null;
  bsisAmt: string | number | null;
  deadline: string | null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx] ?? null;
}

function dist(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  return {
    count: s.length,
    min: percentile(s, 0),
    p25: percentile(s, 25),
    p50: percentile(s, 50),
    p75: percentile(s, 75),
    max: percentile(s, 100),
    avg: s.length > 0 ? s.reduce((a, b) => a + b, 0) / s.length : null,
  };
}

function topN(names: (string | null | undefined)[], n: number): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const raw of names) {
    const k = (raw ?? "").trim();
    if (k.length < 2) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));
}

// 사정율 = 예정가(낙찰가 ÷ 낙찰률) ÷ 기초금액 × 100 — 유효범위 97~103 (CLAUDE.md 공식)
function sajungOf(finalPrice: number, bidRate: number, bsisAmt: number): number | null {
  if (finalPrice <= 0 || bidRate <= 0 || bsisAmt <= 0) return null;
  const rate = (finalPrice / (bidRate / 100) / bsisAmt) * 100;
  return rate >= 97 && rate <= 103 ? rate : null;
}

async function fetchAnnMap(admin: ReturnType<typeof createAdminClient>, konepsIds: string[]): Promise<Map<string, AnnRow>> {
  const map = new Map<string, AnnRow>();
  for (const ids of chunk([...new Set(konepsIds)], 200)) {
    const { data } = await admin
      .from("Announcement")
      .select("konepsId,title,orgName,category,region,bsisAmt,deadline")
      .in("konepsId", ids);
    for (const a of (data ?? []) as AnnRow[]) map.set(a.konepsId, a);
  }
  return map;
}

function monthlyTrend(dates: (string | null)[]): { ym: string; count: number }[] {
  const now = new Date();
  const buckets: { ym: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, count: 0 });
  }
  const idx = new Map(buckets.map((b, i) => [b.ym, i]));
  for (const raw of dates) {
    if (!raw) continue;
    const d = new Date(raw);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const i = idx.get(ym);
    if (i != null) {
      const b = buckets[i];
      if (b) b.count++;
    }
  }
  return buckets;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: dbUser } = await admin
    .from("User")
    .select("id,plan,grandfathered,isAdmin")
    .eq("supabaseId", user.id)
    .single();
  const effPlan = (dbUser?.grandfathered ? "PRO" : dbUser?.plan ?? "FREE") as Plan;
  // 심층 분석 = REALTIME_MONITOR 와 동일 티어 (PRO+) — 요금제 표 "경쟁사·발주처 심층 분석" ✓ PRO부터
  if (!dbUser?.isAdmin && !canAccess(effPlan, Feature.REALTIME_MONITOR)) {
    return NextResponse.json(
      { error: "경쟁사·발주처 심층 분석은 PRO 플랜부터 이용할 수 있습니다.", code: "PLAN_REQUIRED", upgradeUrl: "/billing" },
      { status: 403 },
    );
  }

  const type = req.nextUrl.searchParams.get("type") === "org" ? "org" : "company";
  const name = (req.nextUrl.searchParams.get("name") ?? "").trim();
  if (name.length < 2) return NextResponse.json({ error: "검색어를 2자 이상 입력해주세요." }, { status: 400 });

  // 전체 스캔 쿼리(인덱스 승인 전 6~10초) 남용 방지 — 유저당 분당 6회
  const rl = await rateLimit(`competitor-report:${user.id}`, 6, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 잦습니다. 1분 후 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  // 내부 공백은 유연 매칭 ("대한 건설" → %대한%건설%)
  const pattern = "%" + name.replace(/\s+/g, "%") + "%";

  if (type === "company") return companyReport(admin, name, pattern);
  return orgReport(admin, name);
}

// ─── 경쟁사(낙찰업체) 리포트 ──────────────────────────────────────────────────
async function companyReport(admin: ReturnType<typeof createAdminClient>, name: string, pattern: string): Promise<NextResponse> {
  const { data, error } = await admin
    .from("BidResult")
    .select("annId,bidRate,finalPrice,numBidders,winnerName,openedAt")
    .ilike("winnerName", pattern)
    .order("openedAt", { ascending: false, nullsFirst: false })
    .limit(1000);
  if (error) {
    console.error("[competitors/report] BidResult 검색 오류:", error.message);
    return NextResponse.json({ error: "검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }
  const rows = (data ?? []) as ResultRow[];
  if (rows.length === 0) {
    return NextResponse.json({ type: "company", query: name, wins: 0, message: "해당 상호의 낙찰 이력이 없습니다. 상호명을 정확히 입력했는지 확인해주세요." });
  }

  const annMap = await fetchAnnMap(admin, rows.map((r) => r.annId));

  const rates: number[] = [];
  const bidders: number[] = [];
  const sajungs: number[] = [];
  let totalAmount = 0;
  for (const r of rows) {
    const rate = Number(r.bidRate ?? 0);
    const price = Number(r.finalPrice ?? 0);
    if (rate > 0) rates.push(rate);
    if (r.numBidders && r.numBidders > 0) bidders.push(r.numBidders);
    if (price > 0) totalAmount += price;
    const ann = annMap.get(r.annId);
    const s = ann ? sajungOf(price, rate, Number(ann.bsisAmt ?? 0)) : null;
    if (s != null) sajungs.push(s);
  }

  const anns = rows.map((r) => annMap.get(r.annId)).filter((a): a is AnnRow => !!a);
  const variants = topN(rows.map((r) => r.winnerName), 3); // 매칭된 상호 표기 변형 (검증용)

  return NextResponse.json({
    type: "company",
    query: name,
    matchedNames: variants,
    wins: rows.length,
    capped: rows.length >= 1000,
    summary: {
      totalAmount,
      avgBidRate: rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : null,
      avgBidders: bidders.length > 0 ? bidders.reduce((a, b) => a + b, 0) / bidders.length : null,
    },
    rateDist: dist(rates),
    sajung: sajungs.length >= 5 ? dist(sajungs) : null, // 5건 미만은 통계 의미 없음
    topOrgs: topN(anns.map((a) => a.orgName), 5),
    topCategories: topN(anns.map((a) => a.category), 3),
    topRegions: topN(anns.map((a) => a.region), 3),
    monthly: monthlyTrend(rows.map((r) => r.openedAt)),
    recent: rows.slice(0, 20).map((r) => {
      const ann = annMap.get(r.annId);
      return {
        annId: r.annId,
        title: ann?.title ?? null,
        orgName: ann?.orgName ?? null,
        winnerName: r.winnerName,
        finalPrice: Number(r.finalPrice ?? 0),
        bidRate: Number(r.bidRate ?? 0),
        numBidders: r.numBidders,
        openedAt: r.openedAt,
      };
    }),
    disclaimer: "개찰 후 공개된 나라장터 데이터 기준입니다. 낙찰 이력만 집계되며 패찰(탈락) 투찰은 포함되지 않습니다.",
  });
}

// ─── 발주처 리포트 ────────────────────────────────────────────────────────────
// ⚠️ ORDER BY deadline 금지 — 대형 발주처(조달청 20.9만건)는 전체 정렬이 statement timeout (2026-07-10 실측).
//    deadline 창(개월)으로 좁혀 무정렬 조회 후 클라이언트 정렬. 쓰레기 deadline(5005년 등)은 lt(now)로 자연 배제.
const ANN_FIELDS = "konepsId,title,orgName,category,region,bsisAmt,deadline";
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

async function fetchOrgAnnsExact(admin: ReturnType<typeof createAdminClient>, name: string): Promise<AnnRow[]> {
  const now = new Date();
  for (const months of [6, 24, 96]) {
    const from = new Date(now.getTime() - months * 30 * 86400000).toISOString();
    const { data, error } = await admin
      .from("Announcement")
      .select(ANN_FIELDS)
      .eq("orgName", name)
      .gte("deadline", from)
      .lt("deadline", now.toISOString())
      .limit(600);
    if (error) {
      console.error("[competitors/report] Announcement eq 검색 오류:", error.message);
      return [];
    }
    const rows = (data ?? []) as AnnRow[];
    if (rows.length >= 50 || months === 96) {
      return rows.sort((a, b) => String(b.deadline ?? "").localeCompare(String(a.deadline ?? "")));
    }
  }
  return [];
}

// 표기 변형 폴백 — search_ann_nospace RPC (nospace GIN 인덱스, 164ms 실측).
// ⚠️ ilike 창 스캔은 12초 timeout (2026-07-10 실측) — 절대 회귀 금지.
// RPC 는 title 도 매칭하므로 orgName 정규화 포함 필터 재적용, bsisAmt 는 konepsId 재조회로 보충.
async function fetchOrgAnnsFuzzy(admin: ReturnType<typeof createAdminClient>, name: string): Promise<AnnRow[]> {
  const { data: fuzzy, error } = await admin.rpc("search_ann_nospace", {
    p_keyword: name,
    p_deadline_gte: null,
    p_limit: 600,
    p_offset: 0,
  });
  if (error) {
    console.error("[competitors/report] search_ann_nospace 오류:", error.message);
    return [];
  }
  const target = norm(name);
  const ids = ((fuzzy ?? []) as { konepsId: string; orgName: string | null }[])
    .filter((f) => f.orgName && norm(f.orgName).includes(target))
    .map((f) => f.konepsId);
  if (ids.length === 0) return [];

  const nowIso = new Date().toISOString();
  const out: AnnRow[] = [];
  for (const c of chunk([...new Set(ids)], 200)) {
    const { data } = await admin
      .from("Announcement")
      .select(ANN_FIELDS)
      .in("konepsId", c)
      .lt("deadline", nowIso); // 마감 완료(=개찰 가능)만
    out.push(...((data ?? []) as AnnRow[]));
  }
  return out
    .sort((a, b) => String(b.deadline ?? "").localeCompare(String(a.deadline ?? "")))
    .slice(0, 600);
}

async function orgReport(admin: ReturnType<typeof createAdminClient>, name: string): Promise<NextResponse> {
  // 정확 일치 우선 (btree 인덱스) → nospace RPC 폴백
  let anns = await fetchOrgAnnsExact(admin, name);
  if (anns.length === 0) anns = await fetchOrgAnnsFuzzy(admin, name);
  if (anns.length === 0) {
    return NextResponse.json({ type: "org", query: name, annCount: 0, message: "해당 발주처의 최근 공고가 없습니다. 발주처명을 정확히 입력했는지 확인해주세요." });
  }

  const annMap = new Map(anns.map((a) => [a.konepsId, a]));
  const results: ResultRow[] = [];
  for (const ids of chunk(anns.map((a) => a.konepsId), 200)) {
    const { data } = await admin
      .from("BidResult")
      .select("annId,bidRate,finalPrice,numBidders,winnerName,openedAt")
      .in("annId", ids);
    results.push(...((data ?? []) as ResultRow[]));
  }
  results.sort((a, b) => String(b.openedAt ?? "").localeCompare(String(a.openedAt ?? "")));

  const rates: number[] = [];
  const sajungs: number[] = [];
  const winnerStats = new Map<string, { count: number; rateSum: number; rateN: number }>();
  for (const r of results) {
    const rate = Number(r.bidRate ?? 0);
    if (rate > 0) rates.push(rate);
    const ann = annMap.get(r.annId);
    const s = ann ? sajungOf(Number(r.finalPrice ?? 0), rate, Number(ann.bsisAmt ?? 0)) : null;
    if (s != null) sajungs.push(s);
    const w = (r.winnerName ?? "").trim();
    if (w.length >= 2) {
      const st = winnerStats.get(w) ?? { count: 0, rateSum: 0, rateN: 0 };
      st.count++;
      if (rate > 0) { st.rateSum += rate; st.rateN++; }
      winnerStats.set(w, st);
    }
  }
  const topWinners = [...winnerStats.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([winner, st]) => ({ name: winner, count: st.count, avgRate: st.rateN > 0 ? st.rateSum / st.rateN : null }));

  return NextResponse.json({
    type: "org",
    query: name,
    orgNameMatched: anns[0]?.orgName ?? name,
    annCount: anns.length,
    capped: anns.length >= 600,
    resultCount: results.length,
    summary: {
      avgBidRate: rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : null,
    },
    rateDist: dist(rates),
    sajung: sajungs.length >= 5 ? dist(sajungs) : null,
    topWinners,
    topCategories: topN(anns.map((a) => a.category), 3),
    monthly: monthlyTrend(results.map((r) => r.openedAt)),
    recent: results.slice(0, 20).map((r) => {
      const ann = annMap.get(r.annId);
      return {
        annId: r.annId,
        title: ann?.title ?? null,
        orgName: ann?.orgName ?? null,
        winnerName: r.winnerName,
        finalPrice: Number(r.finalPrice ?? 0),
        bidRate: Number(r.bidRate ?? 0),
        numBidders: r.numBidders,
        openedAt: r.openedAt,
      };
    }),
    disclaimer: "개찰 후 공개된 나라장터 데이터 기준입니다. 최근 공고 최대 600건 범위로 집계합니다.",
  });
}
