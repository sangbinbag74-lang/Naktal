import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { BidResultCombos } from "@/components/naktal/BidResultCombos";

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

  const { data: dbUser } = await admin.from("User").select("id").eq("supabaseId", user.id).single();
  if (!dbUser) redirect("/login");

  // 공고 조회 (category/region/budget 포함)
  const { data: ann } = await admin
    .from("Announcement")
    .select("id,title,orgName,deadline,category,region,budget")
    .or(`id.eq.${annId},konepsId.eq.${annId}`)
    .maybeSingle();
  if (!ann) notFound();

  // 계약 완료된 BidRequest 조회
  const { data: req } = await admin
    .from("BidRequest")
    .select("recommendedBidPrice,lowerLimitPrice,estimatedPrice,budget,predictedSajungRate,agreedFeeRate,agreedFeeAmount,contractAt,winProbability,competitionScore,aValueYn,aValueTotal,lowerLimitRate")
    .eq("userId", dbUser.id as string)
    .eq("annId", ann.id as string)
    .not("contractAt", "is", null)
    .maybeSingle();

  // 계약 안 됐으면 계약 페이지로
  if (!req) redirect(`/bid-contract/${ann.id}`);

  const price = Number(req.recommendedBidPrice ?? 0);
  const lowerLimit = Number(req.lowerLimitPrice ?? 0);
  const budget = Number(req.budget ?? 0);
  const sajungRate = Number(req.predictedSajungRate ?? 0);
  const feeRate = Number(req.agreedFeeRate ?? 0);
  const feeAmount = Number(req.agreedFeeAmount ?? 0);
  const bidRate = budget > 0 ? (price / budget) * 100 : null;

  // 사정율 편차 계산 (SajungRateStat avg 조회)
  const annBudget = Number(ann.budget ?? 0);
  const budgetRange = classifyBudget(annBudget > 0 ? annBudget : budget);

  const { data: statRow } = await admin
    .from("SajungRateStat")
    .select("avg,sampleSize")
    .eq("orgName", ann.orgName as string)
    .eq("category", ann.category as string)
    .eq("budgetRange", budgetRange)
    .eq("region", ann.region as string)
    .maybeSingle();

  const needFallback = !statRow || (Number(statRow.sampleSize ?? 0) < 5);
  const { data: statFallback } = needFallback
    ? await admin.from("SajungRateStat").select("avg,sampleSize")
        .eq("orgName", "ALL")
        .eq("category", ann.category as string)
        .eq("budgetRange", budgetRange)
        .eq("region", "")
        .maybeSingle()
    : { data: null };

  const avgSajungRate = Number((statRow ?? statFallback)?.avg ?? 0);
  const sajungDeviation = avgSajungRate > 0 ? sajungRate - avgSajungRate : null;
  const sampleSize = Number(statRow?.sampleSize ?? statFallback?.sampleSize ?? 0);
  const winProbability = Number(req.winProbability ?? 0); // 0~100 정수
  const competitionScore = Number(req.competitionScore ?? 0);
  const safetyMargin = price - lowerLimit; // 추천 - 낙찰하한가 (안전 마진 + seq)
  const confidenceLevel: "HIGH" | "MEDIUM" | "LOW" = sampleSize >= 30 ? "HIGH" : sampleSize >= 5 ? "MEDIUM" : "LOW";
  // A값 정보
  const isAValue = String(req.aValueYn ?? "") === "Y";
  const aValueTotal = Number(req.aValueTotal ?? 0);
  const lowerLimitRateNum = Number(req.lowerLimitRate ?? 87.745);
  // 예정가 = 기초금액(budget) × 예측사정율
  const estimatedPriceCalc = budget * (sajungRate / 100);

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

      {/* 상세 정보 */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px 24px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>투찰 참고 정보</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { label: "AI 추천 투찰금액", value: fmtPrice(price), bold: true },
            { label: "기초금액", value: fmtPrice(budget) + " (부가세 포함)" },
            { label: "예정가 (예측)", value: fmtPrice(estimatedPriceCalc) },
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
      </div>

      {/* AI 정밀 분석 (계약 회원 전용) */}
      <div style={{
        background: "#fff", borderRadius: 14,
        border: "2px solid #1B3A6B", padding: "20px 24px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#1B3A6B" }}>🔬 AI 정밀 분석</span>
          <span style={{
            fontSize: 10, fontWeight: 700, background: "#EEF2FF", color: "#1B3A6B",
            padding: "2px 7px", borderRadius: 4,
          }}>
            계약 회원 전용
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {[
            {
              label: "낙찰 확률",
              value: `${winProbability.toFixed(0)}%`,
              sub: "몬테카를로 시뮬레이션 (N=5000)",
              color: winProbability >= 70 ? "#059669" : winProbability >= 50 ? "#1B3A6B" : "#C2410C",
            },
            {
              label: "경쟁 강도",
              value: `${competitionScore}점`,
              sub: competitionScore >= 70 ? "매우 치열" : competitionScore >= 50 ? "보통" : "낮음",
              color: competitionScore >= 70 ? "#DC2626" : competitionScore >= 50 ? "#C2410C" : "#059669",
            },
            {
              label: "AI 신뢰도",
              value: confidenceLevel,
              sub: `유사 ${sampleSize}건 기반`,
              color: confidenceLevel === "HIGH" ? "#059669" : confidenceLevel === "MEDIUM" ? "#1B3A6B" : "#C2410C",
            },
            {
              label: "안전 마진",
              value: `+${fmtPrice(safetyMargin)}`,
              sub: "낙찰하한가 위 (사정율 오차 보상)",
              color: "#1B3A6B",
            },
          ].map((m) => (
            <div key={m.label} style={{ background: "#F8FAFC", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: m.color, marginBottom: 4 }}>{m.value}</div>
              <div style={{ fontSize: 10, color: "#9CA3AF" }}>{m.sub}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 12, lineHeight: 1.5 }}>
          ※ 안전 마진 = 낙찰하한가 + 동적 마진 (HIGH 0.05%p / MEDIUM 0.2%p / LOW 0.5%p) + 회사별 seq원 (동가 회피).
          ML 모델 사정율 예측 오차를 보상하여 낙찰 확률을 최대화합니다.
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
      <BidResultCombos annDbId={ann.id as string} />

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
