import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { BidResultCombos } from "@/components/naktal/BidResultCombos";
import { classifyCategory, DEFAULT_LWLT_BY_KIND } from "@/lib/analysis/category-config";
import { recommendNumbers } from "@/lib/core1/frequency-engine";

// 카테고리(공사/용역/물품) 평균 사정율 — 1시간 캐시 (전 사용자 공통)
// 1차: orgName='ALL' 집계, 0건이면 2차: 카테고리 전체 row 가중평균
const getCategoryAllAvgSajung = unstable_cache(
  async (category: string): Promise<{ avg: number; total: number }> => {
    const admin = createAdminClient();
    const { data: allRows } = await admin
      .from("SajungRateStat")
      .select("avg,sampleSize")
      .eq("orgName", "ALL")
      .eq("category", category)
      .eq("region", "");
    let rows = (allRows ?? []) as Array<{ avg: number; sampleSize: number }>;
    let total = rows.reduce((s, r) => s + Number(r.sampleSize ?? 0), 0);
    // 폴백 — ALL row 없으면 카테고리 전체로 가중평균 (모든 발주처 합산, sampleSize 큰 순 5000건)
    if (total === 0) {
      const { data: catRows } = await admin
        .from("SajungRateStat")
        .select("avg,sampleSize")
        .eq("category", category)
        .gt("sampleSize", 0)
        .order("sampleSize", { ascending: false })
        .limit(5000);
      rows = (catRows ?? []) as Array<{ avg: number; sampleSize: number }>;
      total = rows.reduce((s, r) => s + Number(r.sampleSize ?? 0), 0);
    }
    const avg = total > 0
      ? rows.reduce((s, r) => s + Number(r.avg) * Number(r.sampleSize ?? 0), 0) / total
      : 0;
    return { avg, total };
  },
  ["sajung-stat-all-avg-v2"],
  { revalidate: 3600, tags: ["sajung-stat"] },
);

function classifyBudget(budget: number): string {
  if (budget < 100_000_000)   return "1억미만";
  if (budget < 300_000_000)   return "1억-3억";
  if (budget < 1_000_000_000) return "3억-10억";
  if (budget < 3_000_000_000) return "10억-30억";
  return "30억이상";
}

export const dynamic = "force-dynamic";

function fmtPrice(n: number) {
  return new Intl.NumberFormat("ko-KR").format(Math.round(n)) + "원";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function fmtDeviation(dev: number) {
  const sign = dev >= 0 ? "+" : "";
  return `${sign}${dev.toFixed(3)}%p`;
}

// ContractRow 의 getDDay 와 동일 (ceil 기반) — D-N 표시 일관성
function fmtDDay(deadline: string): { label: string; sub: string; color: string } {
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return { label: "개찰 완료", sub: "결과 확인 중", color: "#475569" };
  const dCeil = Math.ceil(ms / 86400000);
  const totalH = Math.floor(ms / 3600000);
  const hrs = totalH % 24;
  const color = dCeil <= 2 ? "#DC2626" : dCeil <= 5 ? "#C2410C" : "#1B3A6B";
  if (totalH >= 24) return { label: `D-${dCeil}`, sub: `${totalH}시간 남음`, color };
  return { label: `D-${dCeil}`, sub: `${totalH}시간 ${Math.floor((ms % 3600000) / 60000)}분 남음`, color: "#DC2626" };
}

export default async function BidResultPage({
  params,
}: {
  params: Promise<{ annId: string }>;
}) {
  const { annId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  // dbUser + ann 병렬 (서로 독립)
  const [dbUserRes, annRes] = await Promise.all([
    admin.from("User").select("id").eq("supabaseId", user.id).single(),
    admin
      .from("Announcement")
      .select("id,title,orgName,deadline,category,region,budget,bsisAmt,aValueAmt")
      .or(`id.eq.${annId},konepsId.eq.${annId}`)
      .maybeSingle(),
  ]);
  const dbUser = dbUserRes.data;
  const ann = annRes.data;
  if (!dbUser) redirect("/login");
  if (!ann) notFound();

  // 계약 완료된 BidRequest 조회 (snapshot 컬럼 포함 — 계약 시점 값 고정)
  const { data: req } = await admin
    .from("BidRequest")
    .select("recommendedBidPrice,lowerLimitPrice,estimatedPrice,budget,predictedSajungRate,agreedFeeRate,agreedFeeAmount,contractAt,winProbability,competitionScore,aValueYn,aValueTotal,lowerLimitRate,userBidPrice,userBidAt,userRank,userBidRate,userDrwtNo1,userDrwtNo2,actualFinalPrice,totalBidders,isWon,winnerName,actualSajungRate,numberStrategy,snapshotAvgSajungRate,snapshotSampleSize,snapshotConfidence,snapshotCategoryAvg,snapshotCategoryTotal")
    .eq("userId", dbUser.id as string)
    .eq("annId", ann.id as string)
    .not("contractAt", "is", null)
    .maybeSingle();

  // 계약 안 됐으면 계약 페이지로
  if (!req) redirect(`/bid-contract/${ann.id}`);

  const price = Number(req.recommendedBidPrice ?? 0);
  const lowerLimit = Number(req.lowerLimitPrice ?? 0);
  // 사정율 분모 = Announcement.bsisAmt 우선 (박상빈님 5/17 명시).
  // BidRequest.budget 은 옛 의뢰 (5/10 이전) 가 추정가격으로 저장돼 있어 부정확.
  const annBsisAmt = Number((ann as unknown as Record<string, unknown>).bsisAmt ?? 0);
  const annAValueAmt = Number((ann as unknown as Record<string, unknown>).aValueAmt ?? 0);
  const annBudgetRaw = Number(ann.budget ?? 0);
  const annBaseAmount = annBsisAmt > 0 ? annBsisAmt : annAValueAmt > 0 ? annAValueAmt : annBudgetRaw * 1.1;
  const reqBudget = Number(req.budget ?? 0);
  const budget = annBaseAmount > 0 ? annBaseAmount : reqBudget;
  const sajungRate = Number(req.predictedSajungRate ?? 0);
  const feeRate = Number(req.agreedFeeRate ?? 0);
  const feeAmount = Number(req.agreedFeeAmount ?? 0);
  const bidRate = budget > 0 ? (price / budget) * 100 : null;

  // 사정율 편차 계산 (SajungRateStat avg 조회)
  const annBudget = Number(ann.budget ?? 0);
  const budgetRange = classifyBudget(annBudget > 0 ? annBudget : budget);

  // 계약 시점 스냅샷 우선 (이후 변동 차단). 없으면 SajungRateStat 폴백.
  const hasSnapshot = req.snapshotAvgSajungRate != null && req.snapshotSampleSize != null;

  let avgSajungRate: number;
  let sampleSize: number;

  if (hasSnapshot) {
    avgSajungRate = Number(req.snapshotAvgSajungRate);
    sampleSize    = Number(req.snapshotSampleSize);
  } else {
    // 옛 BidRequest (스냅샷 컬럼 도입 전) — SajungRateStat 직접 조회
    const [statRowRes, statFallbackRes] = await Promise.all([
      admin
        .from("SajungRateStat")
        .select("avg,sampleSize")
        .eq("orgName", ann.orgName as string)
        .eq("category", ann.category as string)
        .eq("budgetRange", budgetRange)
        .eq("region", ann.region as string)
        .maybeSingle(),
      admin
        .from("SajungRateStat")
        .select("avg,sampleSize")
        .eq("orgName", "ALL")
        .eq("category", ann.category as string)
        .eq("budgetRange", budgetRange)
        .eq("region", "")
        .maybeSingle(),
    ]);
    const statRow = statRowRes.data;
    const statFallback = statFallbackRes.data;
    avgSajungRate = Number((statRow ?? statFallback)?.avg ?? 0);
    sampleSize = Number(statRow?.sampleSize ?? statFallback?.sampleSize ?? 0);
  }

  // 부모 단위 ILIKE 확장 — snapshot 없을 때만 (계약 시점 값 변동 차단)
  if (!hasSnapshot && sampleSize < 5) {
    const orgTokens = String(ann.orgName ?? "").trim().split(/\s+/);
    const candidates = [
      orgTokens.length >= 2 ? `${orgTokens[0]} ${orgTokens[1]}` : null,
      orgTokens.length >= 1 ? orgTokens[0] : null,
    ].filter(Boolean) as string[];
    for (const prefix of candidates) {
      const { data: parentRows } = await admin
        .from("SajungRateStat")
        .select("avg,sampleSize")
        .ilike("orgName", `${prefix}%`)
        .eq("category", ann.category as string)
        .eq("budgetRange", budgetRange)
        .eq("region", ann.region as string);
      const rows = (parentRows ?? []) as Array<{ avg: number; sampleSize: number }>;
      const total = rows.reduce((s, r) => s + Number(r.sampleSize ?? 0), 0);
      if (total >= 5) {
        avgSajungRate = rows.reduce((s, r) => s + Number(r.avg) * Number(r.sampleSize ?? 0), 0) / total;
        sampleSize = total;
        break;
      }
    }
  }
  const sajungDeviation = avgSajungRate > 0 ? sajungRate - avgSajungRate : null;
  const winProbability = Number(req.winProbability ?? 0); // 0~100 정수
  const competitionScore = Number(req.competitionScore ?? 0);
  // safetyMargin 제거됨 (2026-05-11): 안전 마진 + seq 폐기, 추천금액 = 낙찰하한가
  // snapshot 신뢰도 우선 (계약 시점 고정)
  const confidenceLevel: "HIGH" | "MEDIUM" | "LOW" =
    (req.snapshotConfidence === "HIGH" || req.snapshotConfidence === "MEDIUM" || req.snapshotConfidence === "LOW")
      ? req.snapshotConfidence
      : (sampleSize >= 30 ? "HIGH" : sampleSize >= 5 ? "MEDIUM" : "LOW");
  // A값 정보
  const isAValue = String(req.aValueYn ?? "") === "Y";
  const aValueTotal = Number(req.aValueTotal ?? 0);
  const lowerLimitRateNum = Number(req.lowerLimitRate ?? DEFAULT_LWLT_BY_KIND[classifyCategory(ann.category as string)]);
  // 예정가 = 기초금액(budget) × 예측사정율
  const estimatedPriceCalc = budget * (sajungRate / 100);

  // 추천 적용 사정율 (역산) — 화면 금액(price) 으로 G2B 계산기 검증용
  // 2026-05-16 박상빈님 지시로 안전마진 제거 후: effectiveSajungRate == predictedSajungRate (이론상 동일)
  // 옛 BidRequest (안전마진 포함 시점) 호환 위해 역산 유지
  const effectiveSajungRate = budget > 0 && lowerLimitRateNum > 0
    ? (((price - aValueTotal) * 100 / lowerLimitRateNum) + aValueTotal) * 100 / budget
    : sajungRate;
  const effectiveDeviation = avgSajungRate > 0 ? effectiveSajungRate - avgSajungRate : null;
  // G2B 검증용 예정가 = budget × effectiveSajungRate / 100 (≈ 화면 추천금액 검증)
  const effectiveEstPrice = budget * (effectiveSajungRate / 100);

  // 낙찰여부 (G2B API 자동 확인됨 — 사용자 회사명 vs 낙찰자명 매칭)
  const isWonVal = req.isWon as boolean | null;
  const winnerNameVal = req.winnerName as string | null;
  const totalBiddersN = Number(req.totalBidders ?? 0);

  // D 카드 + 번호 조합 백필 병렬
  const annKindForLabel = classifyCategory(ann.category as string);
  const kindLabel = annKindForLabel === "construction" ? "공사" : annKindForLabel === "service" ? "용역" : "물품";

  const needBackfill = !req.numberStrategy;
  const hasCatSnapshot = req.snapshotCategoryAvg != null && req.snapshotCategoryTotal != null;

  // 카테고리 평균: snapshot 우선, 없으면 unstable_cache 폴백
  const [catSnapshot, computedStrategy] = await Promise.all([
    hasCatSnapshot
      ? Promise.resolve({ avg: Number(req.snapshotCategoryAvg), total: Number(req.snapshotCategoryTotal) })
      : getCategoryAllAvgSajung(ann.category as string),
    needBackfill
      ? recommendNumbers({
          annId: ann.id as string,
          category: ann.category as string,
          budgetRange,
          region: ann.region as string,
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
          supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        }).catch((e) => { console.error("[bid-result] numberStrategy 백필 실패:", e); return null; })
      : Promise.resolve(null),
  ]);
  const categoryAvgSajungRate = catSnapshot.avg;
  const catTotal = catSnapshot.total;

  let resolvedStrategy: unknown = req.numberStrategy ?? computedStrategy ?? null;
  // DB UPDATE 는 fire-and-forget — 페이지 응답 차단하지 않음
  if (needBackfill && computedStrategy) {
    void admin
      .from("BidRequest")
      .update({ numberStrategy: computedStrategy, updatedAt: new Date().toISOString() })
      .eq("userId", dbUser.id as string)
      .eq("annId", ann.id as string)
      .then(({ error }) => { if (error) console.error("[bid-result] numberStrategy UPDATE 실패:", error.message); });
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20, paddingBottom: 40 }}>

      {/* 완료 헤더 */}
      <div style={{
        background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2",
        padding: "28px 24px", textAlign: "center",
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", marginBottom: 6 }}>계약이 완료되었습니다</div>
        <div style={{ fontSize: 13, color: "#64748B" }}>
          {ann.title as string}
        </div>
        <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>
          {ann.orgName as string} · 마감 {fmtDate(ann.deadline as string)}
        </div>
      </div>

      {/* AI 추천 투찰금액 */}
      <div style={{
        background: "linear-gradient(135deg, #1B3A6B 0%, #2563EB 100%)",
        borderRadius: 14, padding: "28px 24px", textAlign: "center",
      }}>
        <div style={{ fontSize: 12, color: "#93C5FD", marginBottom: 8, fontWeight: 600 }}>
          AI 추천 투찰금액
        </div>
        <div style={{ fontSize: 36, fontWeight: 900, color: "#fff", letterSpacing: "-1px" }}>
          {fmtPrice(price)}
        </div>
        <div style={{ fontSize: 12, color: "#BFDBFE", marginTop: 8 }}>
          예측 사정율 {sajungRate.toFixed(3)}%
          {sajungDeviation !== null && (
            <span style={{
              marginLeft: 6,
              color: sajungDeviation >= 0 ? "#86EFAC" : "#FCA5A5",
              fontWeight: 700,
            }}>
              ({fmtDeviation(sajungDeviation)})
            </span>
          )}
        </div>
      </div>

      {/* A값 적용 공고 정보 */}
      {isAValue && aValueTotal > 0 && (
        <div style={{ background: "#FFFBEB", borderRadius: 14, border: "1px solid #FDE68A", padding: "16px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E", marginBottom: 10 }}>
            🅰 A값 적용 공고
          </div>
          <div style={{ fontSize: 13, color: "#78350F", marginBottom: 6 }}>
            A값: <strong>{fmtPrice(aValueTotal)}</strong>
          </div>
          <div style={{ fontSize: 11, color: "#B45309", lineHeight: 1.6 }}>
            투찰가 공식: (예정가 - A값) × 낙찰하한율 + A값
          </div>
        </div>
      )}

      {/* 내 투찰 결과 (G2B 매칭 — userBidPrice 있을 때만) */}
      {req.userBidPrice != null && (
        <div style={{
          background: "#fff",
          borderRadius: 14,
          border: "2px solid #1B3A6B",
          padding: "20px 24px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#1B3A6B" }}>📋 내 투찰 결과</span>
            <span style={{ fontSize: 10, fontWeight: 700, background: "#EFF6FF", color: "#1B3A6B", padding: "2px 7px", borderRadius: 4 }}>
              G2B 자동 매칭
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 12 }}>
            <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>내 순위</div>
              {req.userRank != null ? (
                <div style={{
                  fontSize: 20, fontWeight: 800,
                  color: Number(req.userRank) === 1 ? "#059669" : Number(req.userRank) <= 3 ? "#D97706" : "#374151",
                }}>
                  {String(req.userRank)}위{totalBiddersN > 0 ? ` / ${totalBiddersN}` : ""}
                </div>
              ) : (
                <div style={{ fontSize: 16, fontWeight: 700, color: "#DC2626" }}>
                  부적격
                </div>
              )}
            </div>
            <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>AI 추천 투찰가</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#1B3A6B" }}>{fmtPrice(price)}</div>
            </div>
            <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>내 실제 투찰가</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#0F172A" }}>{fmtPrice(Number(req.userBidPrice))}</div>
              {req.userBidRate != null && (
                <div style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>투찰률 {Number(req.userBidRate).toFixed(3)}%</div>
              )}
            </div>
            <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>낙찰 여부</div>
              <div style={{
                fontSize: 18, fontWeight: 800,
                color: isWonVal === true ? "#059669" : isWonVal === false ? "#94A3B8" : "#60A5FA",
              }}>
                {isWonVal === true ? "✅ 낙찰" : isWonVal === false ? "미낙찰" : "확인중"}
              </div>
            </div>
          </div>
          {req.userBidAt && (
            <div style={{ marginTop: 10, fontSize: 11, color: "#94A3B8" }}>
              투찰일시: {new Date(req.userBidAt as string).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
            </div>
          )}
        </div>
      )}

      {/* 낙찰 결과 (결과 입력된 경우만) */}
      {(isWonVal !== null || winnerNameVal) && (
        <div style={{
          background: isWonVal === true ? "linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)" : "#fff",
          borderRadius: 14,
          border: `1px solid ${isWonVal === true ? "#86EFAC" : "#E8ECF2"}`,
          padding: "20px 24px",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>
            🏆 낙찰 결과
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>본인 낙찰 여부</div>
              {isWonVal === true ? (
                <div style={{ fontSize: 22, fontWeight: 800, color: "#059669" }}>
                  ✅ 낙찰 (1순위)
                </div>
              ) : isWonVal === false ? (
                <div style={{ fontSize: 22, fontWeight: 800, color: "#94A3B8" }}>
                  미낙찰
                </div>
              ) : (
                <div style={{ fontSize: 18, fontWeight: 700, color: "#60A5FA" }}>
                  결과 확인 중
                </div>
              )}
            </div>
            {totalBiddersN > 0 && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>참여 업체</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>{totalBiddersN}사</div>
              </div>
            )}
          </div>
          {winnerNameVal && (
            <div style={{ marginTop: 12, padding: "8px 12px", background: "#F8FAFC", borderRadius: 8, fontSize: 12, color: "#374151" }}>
              낙찰자: <strong>{winnerNameVal}</strong>
            </div>
          )}
        </div>
      )}

      {/* 상세 정보 */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px 24px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>투찰 참고 정보</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { label: "AI 추천 투찰금액", value: fmtPrice(price), bold: true },
            { label: "기초금액", value: fmtPrice(budget) + " (부가세 포함)" },
            { label: "예정가 (예측)", value: fmtPrice(effectiveEstPrice) },
            isAValue && aValueTotal > 0 ? { label: "A값", value: fmtPrice(aValueTotal) } : null,
            { label: "낙찰하한율", value: `${lowerLimitRateNum.toFixed(3)}%` },
            { label: "낙찰하한가", value: fmtPrice(lowerLimit) },
            bidRate != null ? { label: "투찰률 (기초금액 대비)", value: `${bidRate.toFixed(4)}%` } : null,
            {
              label: "예측 사정율",
              value: sajungDeviation !== null
                ? `${sajungRate.toFixed(3)}% (발주처 평균 ${fmtDeviation(sajungDeviation)})`
                : `${sajungRate.toFixed(3)}%`,
            },
          ].filter((x): x is { label: string; value: string; bold?: boolean } => x !== null).map(({ label, value, bold }) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#64748B" }}>{label}</span>
              <span style={{ fontSize: 14, fontWeight: bold ? 800 : 600, color: bold ? "#1B3A6B" : "#0F172A" }}>{value}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 14, paddingTop: 12, borderTop: "1px solid #F1F5F9", lineHeight: 1.6 }}>
          ※ AI 추천가는 동률 회피를 위해 사용자별 맞춤 보정을 거쳐 미세 조정됩니다.
        </div>
      </div>

      {/* 계약 이후 안내 (개찰 카운트다운 + 통계) */}
      <div style={{
        background: "#fff", borderRadius: 14,
        border: "2px solid #1B3A6B", padding: "20px 24px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#1B3A6B" }}>📌 입찰 참고 데이터</span>
          <span style={{
            fontSize: 10, fontWeight: 700, background: "#EEF2FF", color: "#1B3A6B",
            padding: "2px 7px", borderRadius: 4,
          }}>
            결과 자동 추적
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {(() => {
            const dday = fmtDDay(ann.deadline as string);
            const cards = [
              {
                label: "개찰까지",
                value: dday.label,
                sub: dday.sub,
                color: dday.color,
              },
              {
                label: "발주처 평균 사정율",
                value: avgSajungRate > 0 ? `${avgSajungRate.toFixed(3)}%` : "데이터 부족",
                sub: sampleSize > 0 ? `최근 ${sampleSize}건 기준` : "샘플 부족",
                color: "#1B3A6B",
              },
              // 박상빈님 5/17 명시 삭제: "ML 예측 사정율 (노이즈 적용 전 원본값)" / "공사 일반 평균 사정율"
            ];
            return cards.map((m) => (
              <div key={m.label} style={{ background: "#F8FAFC", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: m.color, marginBottom: 4 }}>{m.value}</div>
                <div style={{ fontSize: 10, color: "#9CA3AF" }}>{m.sub}</div>
              </div>
            ));
          })()}
        </div>
        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 12, lineHeight: 1.5 }}>
          ※ 개찰 후 G2B 결과를 자동 수집하여 낙찰 여부를 페이지에 반영합니다.
        </div>
      </div>

      {/* 수수료 안내 */}
      <div style={{
        background: "#FFFBEB", border: "1px solid #FDE68A",
        borderRadius: 10, padding: "14px 18px",
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", marginBottom: 8 }}>수수료 조건 (낙찰 성공 시에만 발생)</div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "#78350F" }}>
            낙찰 성공 시 ({(feeRate * 100).toFixed(1)}%)
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#92400E" }}>{fmtPrice(feeAmount)}</span>
        </div>
        <div style={{ fontSize: 11, color: "#B45309", marginTop: 6 }}>
          미낙찰 시 수수료 없음 · 낙찰 결과 공고일로부터 14일 이내 납부
        </div>
      </div>

      {/* AI 번호 추천 결과 (복수예가 공고만 자동 표시) */}
      <BidResultCombos annDbId={ann.id as string} stored={resolvedStrategy} />

      {/* 공고 상세로 */}
      <Link
        href={`/announcements/${ann.id}`}
        style={{
          display: "block", textAlign: "center",
          padding: "14px", background: "#1B3A6B", color: "#fff",
          borderRadius: 12, fontSize: 14, fontWeight: 700,
          textDecoration: "none",
        }}
      >
        공고 상세 보기
      </Link>
    </div>
  );
}
