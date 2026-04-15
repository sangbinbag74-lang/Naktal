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
    .select("recommendedBidPrice,lowerLimitPrice,estimatedPrice,budget,predictedSajungRate,agreedFeeRate,agreedFeeAmount,contractAt")
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

      {/* 상세 정보 */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px 24px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>투찰 참고 정보</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { label: "AI 추천 투찰금액", value: fmtPrice(price), bold: true },
            bidRate != null ? { label: "투찰률 (기초금액 대비)", value: `${bidRate.toFixed(4)}%` } : null,
            { label: "낙찰하한가", value: fmtPrice(lowerLimit) },
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
