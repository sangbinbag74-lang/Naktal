import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { BidResultCombos } from "@/components/naktal/BidResultCombos";
import { classifyCategory, DEFAULT_LWLT_BY_KIND } from "@/lib/analysis/category-config";
import { recommendNumbers } from "@/lib/core1/frequency-engine";

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

function fmtDDay(deadline: string): { label: string; sub: string; color: string } {
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return { label: "개찰 완료", sub: "결과 확인 중", color: "#475569" };
  const totalH = Math.floor(ms / 3600000);
  const days = Math.floor(totalH / 24);
  const hrs = totalH % 24;
  if (days >= 1) return { label: `D-${days}`, sub: `${hrs}시간 남음`, color: days <= 2 ? "#DC2626" : days <= 5 ? "#C2410C" : "#1B3A6B" };
  return { label: `${totalH}시간`, sub: `${Math.floor((ms % 3600000) / 60000)}분 남음`, color: "#DC2626" };
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
    .select("recommendedBidPrice,lowerLimitPrice,estimatedPrice,budget,predictedSajungRate,agreedFeeRate,agreedFeeAmount,contractAt,winProbability,competitionScore,aValueYn,aValueTotal,lowerLimitRate,userBidPrice,actualFinalPrice,totalBidders,isWon,winnerName,actualSajungRate,numberStrategy")
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

  let avgSajungRate = Number((statRow ?? statFallback)?.avg ?? 0);
  let sampleSize = Number(statRow?.sampleSize ?? statFallback?.sampleSize ?? 0);

  // 부모 시·군 확장 매칭 (orgName 첫 2 토큰 ILIKE) — '경상북도 봉화군 체육시설사업소' 0건 → '경상북도 봉화군%' 산하 합산
  if (sampleSize < 5) {
    const orgTokens = String(ann.orgName ?? "").trim().split(/\s+/);
    if (orgTokens.length >= 2) {
      const parentOrg = `${orgTokens[0]} ${orgTokens[1]}`;
      const { data: parentRows } = await admin
        .from("SajungRateStat")
        .select("avg,sampleSize")
        .ilike("orgName", `${parentOrg}%`)
        .eq("category", ann.category as string)
        .eq("budgetRange", budgetRange)
        .eq("region", ann.region as string);
      const rows = (parentRows ?? []) as Array<{ avg: number; sampleSize: number }>;
      const total = rows.reduce((s, r) => s + Number(r.sampleSize ?? 0), 0);
      if (total >= 5) {
        avgSajungRate = rows.reduce((s, r) => s + Number(r.avg) * Number(r.sampleSize ?? 0), 0) / total;
        sampleSize = total;
      }
    }
  }
  const sajungDeviation = avgSajungRate > 0 ? sajungRate - avgSajungRate : null;
  const winProbability = Number(req.winProbability ?? 0); // 0~100 정수
  const competitionScore = Number(req.competitionScore ?? 0);
  const safetyMargin = price - lowerLimit; // 추천 - 낙찰하한가 (안전 마진 + seq)
  const confidenceLevel: "HIGH" | "MEDIUM" | "LOW" = sampleSize >= 30 ? "HIGH" : sampleSize >= 5 ? "MEDIUM" : "LOW";
  // A값 정보
  const isAValue = String(req.aValueYn ?? "") === "Y";
  const aValueTotal = Number(req.aValueTotal ?? 0);
  const lowerLimitRateNum = Number(req.lowerLimitRate ?? DEFAULT_LWLT_BY_KIND[classifyCategory(ann.category as string)]);
  // 예정가 = 기초금액(budget) × 예측사정율
  const estimatedPriceCalc = budget * (sajungRate / 100);

  // 낙찰여부 (G2B API 자동 확인됨 — 사용자 회사명 vs 낙찰자명 매칭)
  const isWonVal = req.isWon as boolean | null;
  const winnerNameVal = req.winnerName as string | null;
  const totalBiddersN = Number(req.totalBidders ?? 0);

  // D 카드 — 이 카테고리 일반(ALL) 평균 사정율
  const annKindForLabel = classifyCategory(ann.category as string);
  const kindLabel = annKindForLabel === "construction" ? "공사" : annKindForLabel === "service" ? "용역" : "물품";
  const { data: catAllRows } = await admin
    .from("SajungRateStat")
    .select("avg,sampleSize")
    .eq("orgName", "ALL")
    .eq("category", ann.category as string)
    .eq("region", "");
  const catRows = (catAllRows ?? []) as Array<{ avg: number; sampleSize: number }>;
  const catTotal = catRows.reduce((s, r) => s + Number(r.sampleSize ?? 0), 0);
  const categoryAvgSajungRate = catTotal > 0
    ? catRows.reduce((s, r) => s + Number(r.avg) * Number(r.sampleSize ?? 0), 0) / catTotal
    : 0;

  // 번호 조합 — BidRequest 에 저장된 값 우선, 없으면 서버사이드로 1회 계산하여 즉시 UPDATE
  let resolvedStrategy: unknown = req.numberStrategy ?? null;
  if (!resolvedStrategy) {
    try {
      const computed = await recommendNumbers({
        annId: ann.id as string,
        category: ann.category as string,
        budgetRange,
        region: ann.region as string,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
        supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      });
      resolvedStrategy = computed;
      // 백필 — 다음 진입 시 즉시 표시
      await admin
        .from("BidRequest")
        .update({ numberStrategy: computed, updatedAt: new Date().toISOString() })
        .eq("userId", dbUser.id as string)
        .eq("annId", ann.id as string);
    } catch (e) {
      console.error("[bid-result] numberStrategy 백필 실패:", e);
    }
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

      {/* 계약 이후 안내 (개찰 카운트다운 + 통계) */}
      <div style={{
        background: "#fff", borderRadius: 14,
        border: "2px solid #1B3A6B", padding: "20px 24px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#1B3A6B" }}>📋 계약 이후 안내</span>
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
              {
                label: "안전 마진",
                value: `+${fmtPrice(safetyMargin)}`,
                sub: "낙찰하한가 위 (사정율 오차 보상)",
                color: "#1B3A6B",
              },
              {
                label: `${kindLabel} 일반 평균 사정율`,
                value: categoryAvgSajungRate > 0 ? `${categoryAvgSajungRate.toFixed(3)}%` : "데이터 부족",
                sub: catTotal > 0 ? `${kindLabel} 카테고리 ${catTotal.toLocaleString()}건` : "샘플 부족",
                color: "#1B3A6B",
              },
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
