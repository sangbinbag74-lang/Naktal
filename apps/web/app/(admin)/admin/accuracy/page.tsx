import { createAdminClient } from "@/lib/supabase/server";
import { AccuracyClient } from "./AccuracyClient";
import { AccuracyTriggers } from "./AccuracyTriggers";

export const dynamic = "force-dynamic";

function isConstruction(category: string | null | undefined): boolean {
  if (!category) return false;
  return category.includes("공사") || category === "시설공사";
}
function isService(c: string | null | undefined): boolean {
  return !!c && c.includes("용역");
}
function isGoods(c: string | null | undefined): boolean {
  return !!c && c.includes("물품");
}

type AnnInfo = { id: string; title: string; orgName: string; deadline: string; budget: string; category: string } | null;
type BppItem = {
  annId: string;
  predictedSajungRate: number;
  optimalBidPrice: string | null;
  bidPriceRangeLow: string | null;
  bidPriceRangeHigh: string | null;
  winProbability: number | null;
  sampleSize: number | null;
  expiresAt: string;
  createdAt: string;
  announcement: AnnInfo;
  actualSajungRate?: number | null;
  actualFinalPrice?: string | null;
  winnerName?: string | null;
  deviationPct?: number | null;
  isHit?: boolean | null;
};

interface CatStats {
  total: number;
  evaluated: number;
  exactCount: number;
  hitCount: number;
  nearHitCount: number;
  mae: number | null;
}

function computeStats(rows: Array<{ resultFilledAt: string | null; isExact: boolean | null; isHit: boolean | null; isNearHit: boolean | null; deviationPct: number | null }>): CatStats {
  const withResult = rows.filter((r) => r.resultFilledAt != null);
  if (withResult.length === 0) return { total: rows.length, evaluated: 0, exactCount: 0, hitCount: 0, nearHitCount: 0, mae: null };
  return {
    total: rows.length,
    evaluated: withResult.length,
    exactCount: withResult.filter((r) => r.isExact).length,
    hitCount: withResult.filter((r) => r.isHit).length,
    nearHitCount: withResult.filter((r) => r.isNearHit).length,
    mae: withResult.reduce((s, r) => s + Number(r.deviationPct ?? 0), 0) / withResult.length,
  };
}

function pct(n: number, d: number): string {
  if (d === 0) return "-";
  return ((n / d) * 100).toFixed(1) + "%";
}

function rateColor(rate: number, good: number, ok: number): string {
  return rate >= good ? "#059669" : rate >= ok ? "#D97706" : "#DC2626";
}

function maeColor(mae: number | null): string {
  if (mae == null) return "#9CA3AF";
  return mae < 0.5 ? "#059669" : mae < 1.0 ? "#D97706" : "#DC2626";
}

export default async function AdminAccuracyPage() {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  // ─── Step A: 독립 쿼리 6개 동시 실행 (Promise.all 병렬) ─────────────────────
  // 박상빈님 명시 (2026-05-14 C 분할 2단계): 직렬 11개 await → 3 step 병렬화
  const [
    aiPredsRawRes,
    bppListRawRes,
    extraAiRowsRes,
    activeCountRes,
    predCountRes,
    statSummaryRes,
  ] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin.from("AIPrediction") as any)
      .select("annId,isExact,isHit,isNearHit,deviationPct,resultFilledAt")
      .limit(2000),
    admin
      .from("BidPricePrediction")
      .select(`
        annId,
        predictedSajungRate,
        optimalBidPrice,
        bidPriceRangeLow,
        bidPriceRangeHigh,
        winProbability,
        sampleSize,
        expiresAt,
        createdAt,
        announcement:Announcement(id, title, orgName, deadline, budget, category)
      `)
      .order("createdAt", { ascending: false })
      .limit(300),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin.from("AIPrediction") as any)
      .select("annId,konepsId,title,orgName,deadline,budget,predictedSajungRate,actualSajungRate,actualFinalPrice,deviationPct,isHit,resultFilledAt")
      .not("resultFilledAt", "is", null)
      .order("resultFilledAt", { ascending: false })
      .limit(500),
    admin
      .from("Announcement")
      .select("id", { count: "exact", head: true })
      .gt("deadline", now)
      .ilike("category", "%공사%"),
    admin
      .from("BidPricePrediction")
      .select("annId", { count: "exact", head: true })
      .gt("expiresAt", now),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin.from("SajungRateStat") as any)
      .select("sampleSize,stddev")
      .neq("orgName", "ALL")
      .limit(100000),
  ]);

  const aiPredsRaw = aiPredsRawRes.data;
  const bppListRaw = bppListRawRes.data;
  const extraAiRows = extraAiRowsRes.data;
  const activeCount = activeCountRes.count;
  const predCount = predCountRes.count;
  const statSummary = statSummaryRes.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aiAnnIds = (aiPredsRaw ?? []).map((p: any) => p.annId).filter(Boolean);
  const bppListAll = (bppListRaw ?? []) as unknown as BppItem[];
  const bppAnnIds = bppListAll.map((b) => b.annId).filter(Boolean);
  const bppAnnIdSet = new Set(bppAnnIds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extraOnlyAi = (extraAiRows ?? []).filter((r: any) => !bppAnnIdSet.has(r.annId));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extraAnnIds = extraOnlyAi.map((r: any) => r.annId);

  // ─── Step B: 의존 쿼리 4개 동시 실행 (Step A 결과 의존) ─────────────────────
  const [aiAnnsRes, aiResRes, annKonepsRes, extraAnnsRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    aiAnnIds.length > 0
      ? (admin.from("Announcement") as any).select("id,category").in("id", aiAnnIds)
      : Promise.resolve({ data: [] }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bppAnnIds.length > 0
      ? (admin.from("AIPrediction") as any)
          .select("annId,actualSajungRate,actualFinalPrice,deviationPct,isHit")
          .in("annId", bppAnnIds)
      : Promise.resolve({ data: [] }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bppAnnIds.length > 0
      ? (admin.from("Announcement") as any)
          .select("id,konepsId,bsisAmt,budget,aValueAmt")
          .in("id", bppAnnIds)
      : Promise.resolve({ data: [] }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extraAnnIds.length > 0
      ? (admin.from("Announcement") as any).select("id,category").in("id", extraAnnIds)
      : Promise.resolve({ data: [] }),
  ]);
  const aiAnns = aiAnnsRes.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aiCatMap: Record<string, string> = Object.fromEntries((aiAnns ?? []).map((a: any) => [a.id, a.category ?? "기타"]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aiPreds = (aiPredsRaw ?? []).map((p: any) => ({ ...p, category: aiCatMap[p.annId] ?? "기타" }));

  // 카테고리별 통계
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statsAll  = computeStats(aiPreds as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statsCons = computeStats(aiPreds.filter((p: any) => isConstruction(p.category)) as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statsServ = computeStats(aiPreds.filter((p: any) => isService(p.category)) as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statsThng = computeStats(aiPreds.filter((p: any) => isGoods(p.category)) as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statsOther = computeStats(aiPreds.filter((p: any) => !isConstruction(p.category) && !isService(p.category) && !isGoods(p.category)) as any);

  // ─── 통합 예측 목록 — Step A 에서 bppListRaw 미리 가져옴, Step B 에서 의존 쿼리 병렬 실행 완료 ─
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const annIdToKoneps: Record<string, string> = Object.fromEntries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (annKonepsRes.data ?? []).map((a: any) => [a.id, a.konepsId])
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const annIdToBase: Record<string, number> = Object.fromEntries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (annKonepsRes.data ?? []).map((a: any) => {
      const bsis = Number(a.bsisAmt ?? 0);
      const avAmt = Number(a.aValueAmt ?? 0);
      const bud = Number(a.budget ?? 0);
      const base = bsis > 0 ? bsis : avAmt > 0 ? avAmt : Math.round(bud * 1.1);
      return [a.id, base];
    })
  );
  const konepsIds = Object.values(annIdToKoneps);

  // ─── Step C: BidResult (konepsId 의존, 단독 1개 쿼리) ─────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bidResRes = konepsIds.length > 0
    ? await (admin.from("BidResult") as any)
        .select("annId,winnerName,finalPrice,bidRate")
        .in("annId", konepsIds)
    : { data: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aiResMap: Record<string, any> = Object.fromEntries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (aiResRes.data ?? []).map((r: any) => [r.annId, r])
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bidResMap: Record<string, any> = Object.fromEntries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (bidResRes.data ?? []).map((r: any) => [r.annId, r])
  );

  // 결과 정보를 BppItem 에 병합
  // ⚠️ AIPrediction.actualSajungRate 가 없어도 BidResult + bsisAmt 로 직접 계산 (AIPrediction 의존 제거)
  const bppListWithResult: BppItem[] = bppListAll.map((b) => {
    const ai = aiResMap[b.annId];
    const konepsId = annIdToKoneps[b.annId];
    const br = konepsId ? bidResMap[konepsId] : null;

    // 1차: AIPrediction.actualSajungRate (백필됐으면 우선 사용)
    // 2차: BidResult + bsisAmt 직접 계산 — AIPrediction 누락된 row 도 결과 표시
    let actualSajungRate: number | null = ai?.actualSajungRate != null ? Number(ai.actualSajungRate) : null;
    let deviationPct: number | null = ai?.deviationPct != null ? Number(ai.deviationPct) : null;
    let isHit: boolean | null = ai?.isHit ?? null;

    if (actualSajungRate == null && br && br.finalPrice && br.bidRate) {
      const base = annIdToBase[b.annId] ?? 0;
      const finalPrice = Number(br.finalPrice);
      const bidRate = Number(br.bidRate);
      if (base > 0 && finalPrice > 0 && bidRate > 0) {
        actualSajungRate = (finalPrice / (bidRate / 100) / base) * 100;
        const predicted = Number(b.predictedSajungRate ?? 0);
        if (predicted > 0) {
          deviationPct = Math.abs(predicted - actualSajungRate);
          isHit = deviationPct <= 0.5;
        }
      }
    }

    return {
      ...b,
      actualSajungRate,
      actualFinalPrice: br?.finalPrice ?? ai?.actualFinalPrice ?? null,
      winnerName: br?.winnerName ?? null,
      deviationPct,
      isHit,
    };
  });

  // BPP에 없지만 AIPrediction에 결과가 채워진 row 추가 — Step A·B 에서 이미 fetch 완료
  // extraAiRows, extraOnlyAi, extraAnnIds, bppAnnIdSet, extraAnnsRes 는 Step A·B 에서 정의됨
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extraCatMap: Record<string, string> = Object.fromEntries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (extraAnnsRes.data ?? []).map((a: any) => [a.id, a.category ?? "기타"])
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aiOnlyAsBpp: BppItem[] = extraOnlyAi.map((r: any) => ({
    annId: r.annId,
    predictedSajungRate: Number(r.predictedSajungRate ?? 0),
    optimalBidPrice: null,
    bidPriceRangeLow: null,
    bidPriceRangeHigh: null,
    winProbability: null,
    sampleSize: null,
    expiresAt: r.resultFilledAt ?? new Date(0).toISOString(),
    createdAt: r.resultFilledAt ?? new Date(0).toISOString(),
    announcement: {
      id: r.annId,
      title: r.title ?? "",
      orgName: r.orgName ?? "",
      deadline: r.deadline ?? new Date(0).toISOString(),
      budget: String(r.budget ?? "0"),
      category: extraCatMap[r.annId] ?? "기타",
    },
    actualSajungRate: r.actualSajungRate != null ? Number(r.actualSajungRate) : null,
    actualFinalPrice: r.actualFinalPrice ?? null,
    winnerName: null,
    deviationPct: r.deviationPct != null ? Number(r.deviationPct) : null,
    isHit: r.isHit ?? null,
  }));

  const bppList = [...bppListWithResult, ...aiOnlyAsBpp].sort((a, b) => {
    const ac = isConstruction(a.announcement?.category) ? 0 : 1;
    const bc = isConstruction(b.announcement?.category) ? 0 : 1;
    if (ac !== bc) return ac - bc;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // activeCount, predCount, statSummary — Step A 에서 이미 fetch 완료
  let highCount = 0, mediumCount = 0, lowCount = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of statSummary ?? []) {
    const ss = r.sampleSize ?? 0;
    const sd = r.stddev ?? 99;
    if (ss >= 15 && sd <= 2.0) highCount++;
    else if (ss >= 5 && sd <= 3.0) mediumCount++;
    else lowCount++;
  }
  const confidenceTotal = highCount + mediumCount + lowCount;

  // ─── 카테고리 행 데이터 ────────────────────────────────────────────────────
  const catRows: { key: string; label: string; emoji: string; color: string; bg: string; stats: CatStats }[] = [
    { key: "all",   label: "전체", emoji: "📊", color: "#1B3A6B", bg: "#EFF6FF", stats: statsAll },
    { key: "cons",  label: "공사", emoji: "🏗️", color: "#1B3A6B", bg: "#EFF6FF", stats: statsCons },
    { key: "serv",  label: "용역", emoji: "📋", color: "#D97706", bg: "#FFFBEB", stats: statsServ },
    { key: "thng",  label: "물품", emoji: "📦", color: "#7C3AED", bg: "#F5F3FF", stats: statsThng },
    { key: "other", label: "기타", emoji: "📌", color: "#64748B", bg: "#F1F5F9", stats: statsOther },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 헤더 + 트리거 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>정확도 분석</h2>
          <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>
            AI 사정율 예측 적중률 · 카테고리별 분리 · 발주처 신뢰도
          </p>
        </div>
      </div>

      <AccuracyTriggers />

      {/* ── 섹션 1: KPI 4카드 (한눈에 요약) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          {
            label: "전체 예측",
            value: statsAll.total.toLocaleString() + "건",
            sub: `결과 수집 ${statsAll.evaluated}건`,
            color: "#1B3A6B",
          },
          {
            label: "적중률 (±0.5%p)",
            value: statsAll.evaluated > 0 ? pct(statsAll.hitCount, statsAll.evaluated) : "-",
            sub: `${statsAll.hitCount} / ${statsAll.evaluated}건 적중`,
            color: statsAll.evaluated > 0 ? rateColor((statsAll.hitCount / statsAll.evaluated) * 100, 30, 15) : "#9CA3AF",
          },
          {
            label: "평균 편차 (MAE)",
            value: statsAll.mae != null ? statsAll.mae.toFixed(3) + "%p" : "-",
            sub: statsAll.mae != null && statsAll.mae < 0.5 ? "우수" : statsAll.mae != null && statsAll.mae < 1.0 ? "양호" : statsAll.mae != null ? "개선 필요" : "-",
            color: maeColor(statsAll.mae),
          },
          {
            label: "분석 가능 공고",
            value: (predCount ?? 0).toLocaleString() + "건",
            sub: `활성 공사 ${(activeCount ?? 0).toLocaleString()}건 중`,
            color: "#0F172A",
          },
        ].map(({ label, value, sub, color }) => (
          <div key={label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "18px 20px" }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 6, fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── 섹션 2: 카테고리별 정확도 표 ── */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>카테고리별 정확도</span>
          <span style={{ fontSize: 11, color: "#94A3B8" }}>· 사정율 분포가 다르므로 분리 집계</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                {["카테고리", "예측 / 결과수집", "완전적중 ±0.2%p", "적중 ±0.5%p", "근접 ±1.0%p", "MAE"].map((h, idx) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: idx === 0 ? "left" : "center", color: "#374151", fontWeight: 600, borderBottom: "2px solid #E8ECF2", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {catRows.map((row) => {
                const s = row.stats;
                const isAll = row.key === "all";
                return (
                  <tr key={row.key} style={{
                    borderBottom: "1px solid #F1F5F9",
                    background: isAll ? "#FAFBFC" : undefined,
                  }}>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontSize: 13, fontWeight: isAll ? 800 : 700, color: row.color, background: row.bg, padding: "3px 9px", borderRadius: 6 }}>
                        {row.emoji} {row.label}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "center", color: "#374151" }}>
                      <strong style={{ fontSize: 13 }}>{s.total.toLocaleString()}</strong>
                      <span style={{ color: "#94A3B8", marginLeft: 6, fontSize: 11 }}>/ {s.evaluated}</span>
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "center" }}>
                      {s.evaluated > 0 ? (
                        <strong style={{ fontSize: 13.5, color: rateColor((s.exactCount / s.evaluated) * 100, 20, 10) }}>
                          {pct(s.exactCount, s.evaluated)}
                        </strong>
                      ) : <span style={{ color: "#D1D5DB" }}>-</span>}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "center" }}>
                      {s.evaluated > 0 ? (
                        <strong style={{ fontSize: 14, color: rateColor((s.hitCount / s.evaluated) * 100, 30, 15) }}>
                          {pct(s.hitCount, s.evaluated)}
                        </strong>
                      ) : <span style={{ color: "#D1D5DB" }}>-</span>}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "center" }}>
                      {s.evaluated > 0 ? (
                        <strong style={{ fontSize: 13.5, color: rateColor((s.nearHitCount / s.evaluated) * 100, 50, 30) }}>
                          {pct(s.nearHitCount, s.evaluated)}
                        </strong>
                      ) : <span style={{ color: "#D1D5DB" }}>-</span>}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "center" }}>
                      {s.mae != null ? (
                        <strong style={{ fontSize: 13.5, color: maeColor(s.mae) }}>{s.mae.toFixed(3)}%p</strong>
                      ) : <span style={{ color: "#D1D5DB" }}>-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 섹션 3: 통합 예측·결과 목록 (AccuracyClient) ── */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", marginBottom: 10 }}>
          예측·결과 통합 목록
          <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 400, marginLeft: 8 }}>
            · 활성 + 결과 완료 모두 · 검색·상태 필터
          </span>
        </div>
        <AccuracyClient
          bppList={bppList}
          activeCount={activeCount ?? 0}
          predCount={predCount ?? 0}
        />
      </div>

      {/* ── 섹션 5: 발주처 신뢰도 분포 (사이드) ── */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div>
            <span style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>발주처 신뢰도 분포</span>
            <span style={{ fontSize: 11, color: "#94A3B8", marginLeft: 8 }}>총 {confidenceTotal.toLocaleString()}개 발주처</span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 14 }}>
          {[
            { label: "HIGH",   count: highCount,   desc: "N≥15 & σ≤2.0", bg: "#ECFDF5", color: "#059669", border: "#A7F3D0" },
            { label: "MEDIUM", count: mediumCount, desc: "N≥5 & σ≤3.0",  bg: "#FFFBEB", color: "#D97706", border: "#FCD34D" },
            { label: "LOW",    count: lowCount,    desc: "데이터 부족",   bg: "#FEF2F2", color: "#DC2626", border: "#FECACA" },
          ].map(({ label, count, desc, bg, color, border }) => (
            <div key={label} style={{ background: bg, borderRadius: 10, border: `1px solid ${border}`, padding: "16px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color, fontWeight: 700 }}>{label}</span>
                <span style={{ fontSize: 11, color, fontWeight: 600 }}>
                  {confidenceTotal > 0 ? ((count / confidenceTotal) * 100).toFixed(1) : "0.0"}%
                </span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color }}>{count.toLocaleString()}개</div>
              <div style={{ fontSize: 10.5, color: "#9CA3AF", marginTop: 4 }}>{desc}</div>
            </div>
          ))}
        </div>
        {confidenceTotal > 0 && (
          <div style={{ height: 8, borderRadius: 4, overflow: "hidden", display: "flex" }}>
            <div style={{ width: `${(highCount / confidenceTotal) * 100}%`, background: "#059669" }} />
            <div style={{ width: `${(mediumCount / confidenceTotal) * 100}%`, background: "#D97706" }} />
            <div style={{ width: `${(lowCount / confidenceTotal) * 100}%`, background: "#DC2626" }} />
          </div>
        )}
      </div>
    </div>
  );
}
