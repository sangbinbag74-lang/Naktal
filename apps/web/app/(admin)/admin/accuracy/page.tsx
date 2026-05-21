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

  // 박상빈님 5/21 K-2 박스권 ML 운영 적용 시점 (commit 600ccf7) — 이후 신규 분석만 적중률 측정
  // 옛 ensemble-v7 예측 데이터는 보존 (박상빈님 메모리 no_destructive_delete)
  const K2_CUTOFF_ISO = "2026-05-21T16:30:04+09:00";

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
      .select("annId,isExact,isHit,isNearHit,deviationPct,resultFilledAt,predictedAt")
      .gte("predictedAt", K2_CUTOFF_ISO)  // 박상빈님 5/21 — K-2 적용 후만 측정
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
      .gte("createdAt", K2_CUTOFF_ISO)  // 박상빈님 5/21 — K-2 적용 후만 측정
      .order("createdAt", { ascending: false })
      .limit(300),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin.from("AIPrediction") as any)
      .select("annId,konepsId,title,orgName,deadline,budget,predictedSajungRate,optimalBidPrice,bidPriceRangeLow,bidPriceRangeHigh,winProbability,sampleSize,actualSajungRate,actualFinalPrice,deviationPct,isHit,resultFilledAt,predictedAt")
      .not("resultFilledAt", "is", null)
      .gte("predictedAt", K2_CUTOFF_ISO)  // 박상빈님 5/21 — K-2 적용 후만 측정
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
          .select("id,konepsId,bsisAmt,budget,aValueAmt,aValueTotal,sucsfbidLwltRate")
          .in("id", bppAnnIds)
      : Promise.resolve({ data: [] }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extraAnnIds.length > 0
      ? (admin.from("Announcement") as any).select("id,konepsId,category,bsisAmt,budget,aValueAmt,aValueTotal,sucsfbidLwltRate").in("id", extraAnnIds)
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
  // 박상빈님 5/18 명시 (memory project_naktal_ultimate_goal): 부적격율 + 1위율 측정용
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const annIdToLwltInfo: Record<string, { lwltRate: number; aValue: number; base: number }> = Object.fromEntries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (annKonepsRes.data ?? []).map((a: any) => {
      const bsis = Number(a.bsisAmt ?? 0);
      const avAmt = Number(a.aValueAmt ?? 0);
      const aValTotal = Number(a.aValueTotal ?? 0);
      const bud = Number(a.budget ?? 0);
      const base = bsis > 0 ? bsis : avAmt > 0 ? avAmt : Math.round(bud * 1.1);
      const lwltRate = Number(a.sucsfbidLwltRate ?? 0);
      const aValue = aValTotal > 0 ? aValTotal : 0;
      return [a.id, { lwltRate, aValue, base }];
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

    // 박상빈님 5/18 명시 (memory project_naktal_ultimate_goal): 부적격 + 1위 근접 측정
    // 개선 1+2: 사정율 기준 1위 판정 + Range 부적격 측정
    let isDisqualified: boolean | null = null; // AI 추천(opt) < 진짜 낙찰하한가 → 부적격
    let isRangeAllAbove: boolean | null = null; // bidPriceRangeLow >= 진짜 낙찰하한가 (범위 전체 안전)
    let isRangeAllBelow: boolean | null = null; // bidPriceRangeHigh < 진짜 낙찰하한가 (범위 전체 탈락)
    let isTop1Near: boolean | null = null;      // 사정율 차이 ±0.05%p 이내 = 1위 매우 가까움
    let recDistancePct: number | null = null;   // AI 추천과 실제 낙찰가 차이 (%)
    let sajungDeviation: number | null = null;  // |예측사정율 - 실제사정율| (개선 1)
    const info = annIdToLwltInfo[b.annId];
    if (info && info.base > 0 && info.lwltRate > 0 && b.optimalBidPrice) {
      const optimalBid = Number(b.optimalBidPrice);
      // 진짜 낙찰하한가 = (기초금액 - A값) × lwltRate/100 + A값
      const realLowerLimit = (info.base - info.aValue) * (info.lwltRate / 100) + info.aValue;
      isDisqualified = optimalBid < realLowerLimit;
      // 개선 2: Range 부적격 — bidPriceRangeLow / bidPriceRangeHigh 도 함께 측정
      if (b.bidPriceRangeLow) {
        const rangeLow = Number(b.bidPriceRangeLow);
        isRangeAllAbove = rangeLow >= realLowerLimit;
      }
      if (b.bidPriceRangeHigh) {
        const rangeHigh = Number(b.bidPriceRangeHigh);
        isRangeAllBelow = rangeHigh < realLowerLimit;
      }
      // 1위 근접: 가격 기준 + 사정율 기준 둘 다 측정 (개선 1)
      if (br?.finalPrice) {
        const finalPrice = Number(br.finalPrice);
        if (finalPrice > 0) {
          recDistancePct = Math.abs((optimalBid - finalPrice) / finalPrice * 100);
        }
      }
      // 개선 1: 사정율 기준 1위 판정 — 예측 사정율 vs 실제 사정율 ±0.05%p (정밀)
      if (actualSajungRate != null && b.predictedSajungRate != null) {
        sajungDeviation = Math.abs(Number(b.predictedSajungRate) - actualSajungRate);
        isTop1Near = sajungDeviation <= 0.05;
      }
    }
    return {
      ...b,
      actualSajungRate,
      actualFinalPrice: br?.finalPrice ?? ai?.actualFinalPrice ?? null,
      winnerName: br?.winnerName ?? null,
      deviationPct,
      isHit,
      isDisqualified,
      isRangeAllAbove,
      isRangeAllBelow,
      isTop1Near,
      recDistancePct,
      sajungDeviation,
    };
  });

  // BPP에 없지만 AIPrediction에 결과가 채워진 row 추가 — Step A·B 에서 이미 fetch 완료
  // extraAiRows, extraOnlyAi, extraAnnIds, bppAnnIdSet, extraAnnsRes 는 Step A·B 에서 정의됨
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extraCatMap: Record<string, string> = Object.fromEntries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (extraAnnsRes.data ?? []).map((a: any) => [a.id, a.category ?? "기타"])
  );
  // 개선 3: extra path 도 lwlt info 가져와 부적격/1위 측정 적용
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extraLwltMap: Record<string, { lwltRate: number; aValue: number; base: number }> = Object.fromEntries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (extraAnnsRes.data ?? []).map((a: any) => {
      const bsis = Number(a.bsisAmt ?? 0);
      const avAmt = Number(a.aValueAmt ?? 0);
      const aValTotal = Number(a.aValueTotal ?? 0);
      const bud = Number(a.budget ?? 0);
      const base = bsis > 0 ? bsis : avAmt > 0 ? avAmt : Math.round(bud * 1.1);
      const lwltRate = Number(a.sucsfbidLwltRate ?? 0);
      const aValue = aValTotal > 0 ? aValTotal : 0;
      return [a.id, { lwltRate, aValue, base }];
    })
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aiOnlyAsBpp: BppItem[] = extraOnlyAi.map((r: any) => ({
    annId: r.annId,
    predictedSajungRate: Number(r.predictedSajungRate ?? 0),
    // AIPrediction 영구 저장값 우선 사용 (BPP 만료돼도 화면 표시 보장)
    optimalBidPrice: r.optimalBidPrice != null ? String(r.optimalBidPrice) : null,
    bidPriceRangeLow: r.bidPriceRangeLow != null ? String(r.bidPriceRangeLow) : null,
    bidPriceRangeHigh: r.bidPriceRangeHigh != null ? String(r.bidPriceRangeHigh) : null,
    winProbability: r.winProbability != null ? Number(r.winProbability) : null,
    sampleSize: r.sampleSize != null ? Number(r.sampleSize) : null,
    expiresAt: r.resultFilledAt ?? new Date(0).toISOString(),
    createdAt: r.predictedAt ?? r.resultFilledAt ?? new Date(0).toISOString(),
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
    // 개선 3: extra path 도 부적격/1위 측정 적용
    ...(function() {
      const info = extraLwltMap[r.annId];
      const actualSajung = r.actualSajungRate != null ? Number(r.actualSajungRate) : null;
      const predictedSajung = r.predictedSajungRate != null ? Number(r.predictedSajungRate) : null;
      let isDisqualified: boolean | null = null;
      let isRangeAllAbove: boolean | null = null;
      let isRangeAllBelow: boolean | null = null;
      let isTop1Near: boolean | null = null;
      let recDistancePct: number | null = null;
      let sajungDeviation: number | null = null;
      if (info && info.base > 0 && info.lwltRate > 0 && r.optimalBidPrice) {
        const optimalBid = Number(r.optimalBidPrice);
        const realLowerLimit = (info.base - info.aValue) * (info.lwltRate / 100) + info.aValue;
        isDisqualified = optimalBid < realLowerLimit;
        if (r.bidPriceRangeLow) isRangeAllAbove = Number(r.bidPriceRangeLow) >= realLowerLimit;
        if (r.bidPriceRangeHigh) isRangeAllBelow = Number(r.bidPriceRangeHigh) < realLowerLimit;
        if (r.actualFinalPrice) {
          const finalPrice = Number(r.actualFinalPrice);
          if (finalPrice > 0) recDistancePct = Math.abs((optimalBid - finalPrice) / finalPrice * 100);
        }
        if (actualSajung != null && predictedSajung != null) {
          sajungDeviation = Math.abs(predictedSajung - actualSajung);
          isTop1Near = sajungDeviation <= 0.05;
        }
      }
      return { isDisqualified, isRangeAllAbove, isRangeAllBelow, isTop1Near, recDistancePct, sajungDeviation };
    })(),
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

  // 박상빈님 5/18 명시 (memory project_naktal_ultimate_goal):
  // 부적격율 + 1위율 — 공사 카테고리만 측정 (궁극 목표 영역)
  // 개선 3: extra path 도 포함 (bppListWithResult + aiOnlyAsBpp 통합)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allConsRows = [...bppListWithResult, ...aiOnlyAsBpp].filter((b: any) => isConstruction(b.announcement?.category));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const consDisqEvaluated = allConsRows.filter((b: any) => b.isDisqualified != null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const consTop1Evaluated = allConsRows.filter((b: any) => b.isTop1Near != null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const consRangeEvaluated = allConsRows.filter((b: any) => b.isRangeAllBelow != null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const consDisqualified = consDisqEvaluated.filter((b: any) => b.isDisqualified === true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const consTop1Near = consTop1Evaluated.filter((b: any) => b.isTop1Near === true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const consRangeAllBelow = consRangeEvaluated.filter((b: any) => b.isRangeAllBelow === true);
  const ultimateGoal = {
    disqEvaluated: consDisqEvaluated.length,
    disqualifiedCount: consDisqualified.length,
    disqualifiedRate: consDisqEvaluated.length > 0 ? (consDisqualified.length / consDisqEvaluated.length) * 100 : null,
    top1Evaluated: consTop1Evaluated.length,
    top1NearCount: consTop1Near.length,
    top1NearRate: consTop1Evaluated.length > 0 ? (consTop1Near.length / consTop1Evaluated.length) * 100 : null,
    // 개선 2: Range 완전 부적격 (bidPriceRangeHigh < 진짜 낙찰하한가)
    rangeEvaluated: consRangeEvaluated.length,
    rangeAllBelowCount: consRangeAllBelow.length,
    rangeAllBelowRate: consRangeEvaluated.length > 0 ? (consRangeAllBelow.length / consRangeEvaluated.length) * 100 : null,
  };

  // 개선 4: 부적격율 시계열 추이 (createdAt 기준 일자별 집계)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dailyMap: Record<string, { disqEval: number; disq: number; top1Eval: number; top1: number }> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of allConsRows as any[]) {
    if (!b.createdAt) continue;
    const day = String(b.createdAt).slice(0, 10);
    if (!dailyMap[day]) dailyMap[day] = { disqEval: 0, disq: 0, top1Eval: 0, top1: 0 };
    if (b.isDisqualified != null) {
      dailyMap[day].disqEval++;
      if (b.isDisqualified === true) dailyMap[day].disq++;
    }
    if (b.isTop1Near != null) {
      dailyMap[day].top1Eval++;
      if (b.isTop1Near === true) dailyMap[day].top1++;
    }
  }
  const dailyTrend = Object.entries(dailyMap)
    .map(([day, s]) => ({
      day,
      disqRate: s.disqEval > 0 ? (s.disq / s.disqEval) * 100 : null,
      top1Rate: s.top1Eval > 0 ? (s.top1 / s.top1Eval) * 100 : null,
      disqEval: s.disqEval,
      top1Eval: s.top1Eval,
    }))
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-14); // 최근 14일

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
          <p style={{ fontSize: 12, color: "#1B3A6B", margin: "6px 0 0", padding: "6px 10px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 6, display: "inline-block" }}>
            ⚠️ K-2 박스권 ML 운영 적용 (2026-05-21 16:30 KST) 이후 신규 분석만 측정 — 옛 데이터는 DB에 보존
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
            value: statsAll.mae != null ? statsAll.mae.toFixed(4) + "%p" : "-",
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

      {/* ── 섹션 1-b: 궁극 목표 — 부적격율 + 1위율 (공사 전용) ── */}
      <div style={{ background: "linear-gradient(135deg, #FEF3F2 0%, #FEFCE8 100%)", borderRadius: 14, border: "1px solid #FECACA", padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#991B1B" }}>🎯 궁극 목표 (공사)</span>
          <span style={{ fontSize: 11, color: "#94A3B8" }}>· 부적격 ↓ + 1위 ↑ 동시 최적화 (박상빈님 5/17 명시)</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            {
              label: "부적격율 (추천가 미달)",
              value: ultimateGoal.disqualifiedRate != null ? ultimateGoal.disqualifiedRate.toFixed(2) + "%" : "-",
              sub: `${ultimateGoal.disqualifiedCount} / ${ultimateGoal.disqEvaluated}건`,
              color: ultimateGoal.disqualifiedRate != null
                ? (ultimateGoal.disqualifiedRate < 1 ? "#059669" : ultimateGoal.disqualifiedRate < 5 ? "#D97706" : "#DC2626")
                : "#9CA3AF",
              note: "AI 추천가 (opt) < 진짜 낙찰하한가 비율. 낮을수록 좋음.",
            },
            {
              label: "Range 전체 부적격 (개선 2)",
              value: ultimateGoal.rangeAllBelowRate != null ? ultimateGoal.rangeAllBelowRate.toFixed(2) + "%" : "-",
              sub: `${ultimateGoal.rangeAllBelowCount} / ${ultimateGoal.rangeEvaluated}건`,
              color: ultimateGoal.rangeAllBelowRate != null
                ? (ultimateGoal.rangeAllBelowRate < 1 ? "#059669" : ultimateGoal.rangeAllBelowRate < 5 ? "#D97706" : "#DC2626")
                : "#9CA3AF",
              note: "bidPriceRangeHigh < 낙찰하한가 = 추천 범위 전체 탈락. 매우 심각.",
            },
            {
              label: "1위 근접률 (사정율 ±0.05%p)",
              value: ultimateGoal.top1NearRate != null ? ultimateGoal.top1NearRate.toFixed(2) + "%" : "-",
              sub: `${ultimateGoal.top1NearCount} / ${ultimateGoal.top1Evaluated}건`,
              color: ultimateGoal.top1NearRate != null
                ? (ultimateGoal.top1NearRate >= 10 ? "#059669" : ultimateGoal.top1NearRate >= 5 ? "#D97706" : "#DC2626")
                : "#9CA3AF",
              note: "예측 사정율 vs 실제 사정율 ±0.05%p 이내 (정밀, 개선 1).",
            },
          ].map(({ label, value, sub, color, note }) => (
            <div key={label} style={{ background: "#fff", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, color: "#7F1D1D", marginBottom: 4, fontWeight: 700 }}>{label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>{sub}</div>
              <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 6, lineHeight: 1.4 }}>{note}</div>
            </div>
          ))}
        </div>

        {/* 개선 4: 시계열 차트 — 최근 14일 부적격율/1위율 trend */}
        {dailyTrend.length > 0 && (
          <div style={{ marginTop: 16, background: "#fff", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>최근 14일 추이</div>
            <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 80, marginBottom: 6 }}>
              {dailyTrend.map((d) => {
                // 부적격율 빨강 bar (낮을수록 좋음), 1위율 녹색 bar (높을수록 좋음)
                const disqH = d.disqRate != null ? Math.min(80, d.disqRate * 4) : 0;
                const top1H = d.top1Rate != null ? Math.min(80, d.top1Rate * 2) : 0;
                return (
                  <div key={d.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <div style={{ display: "flex", gap: 1, height: 80, alignItems: "flex-end" }}>
                      <div title={`${d.day} 부적격율 ${d.disqRate?.toFixed(2) ?? "-"}% (${d.disqEval}건)`} style={{ width: 8, height: disqH, background: "#DC2626", borderRadius: "2px 2px 0 0" }} />
                      <div title={`${d.day} 1위근접율 ${d.top1Rate?.toFixed(2) ?? "-"}% (${d.top1Eval}건)`} style={{ width: 8, height: top1H, background: "#059669", borderRadius: "2px 2px 0 0" }} />
                    </div>
                    <div style={{ fontSize: 9, color: "#94A3B8", whiteSpace: "nowrap" }}>{d.day.slice(5)}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 14, fontSize: 10, color: "#64748B" }}>
              <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#DC2626", marginRight: 4, borderRadius: 2 }} />부적격율</span>
              <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#059669", marginRight: 4, borderRadius: 2 }} />1위 근접률</span>
            </div>
          </div>
        )}
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
                        <strong style={{ fontSize: 13.5, color: maeColor(s.mae) }}>{s.mae.toFixed(4)}%p</strong>
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
