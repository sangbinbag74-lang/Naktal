import { createAdminClient } from "@/lib/supabase/server";
import { RequestsTable } from "./RequestsTable";
import { AutoRefreshTrigger } from "./AutoRefreshTrigger";

export const dynamic = "force-dynamic";

export default async function AdminRequestsPage() {
  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let requests: any[] = [];
  let totalCount = 0;
  let pendingCount = 0;
  let wonCount = 0;
  let lostCount = 0;
  let feeCount = 0;

  // 적중률 통계
  let hitCount = 0;
  let resultCount = 0;
  let avgDeviation = 0;
  let followWonCount = 0;
  let followCount = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let userMap: Record<string, any> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let companyProfileMap: Record<string, any> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let bidResultMap: Record<string, any> = {};
  // 공고 rawJson.opengDt fallback (BidRequest.openingDt 비어있을 때)
  let annOpengMap: Record<string, string | null> = {};
  // 사정율 역산용 (bsisAmt, aValueTotal, sucsfbidLwltRate)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let annInfoMap: Record<string, { bsisAmt: number; aValueTotal: number; lowerLimitRate: number }> = {};

  try {
    const [
      { count: t },
      { count: pending },
      { count: won },
      { count: lost },
      { count: fee },
    ] = await Promise.all([
      admin.from("BidRequest").select("id", { count: "exact", head: true }),
      admin.from("BidRequest").select("id", { count: "exact", head: true }).is("openingDt", null),
      admin.from("BidRequest").select("id", { count: "exact", head: true }).eq("isWon", true),
      admin.from("BidRequest").select("id", { count: "exact", head: true }).eq("isWon", false),
      admin.from("BidRequest").select("id", { count: "exact", head: true }).eq("feeStatus", "invoiced"),
    ]);
    totalCount   = t ?? 0;
    pendingCount = pending ?? 0;
    wonCount     = won ?? 0;
    lostCount    = lost ?? 0;
    feeCount     = fee ?? 0;

    // 적중률 통계용 데이터
    const { data: statRows } = await admin
      .from("BidRequest")
      .select("isHit,deviationPct,userFollowedRecommendation,isWon")
      .not("resultDetectedAt", "is", null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (statRows && statRows.length > 0) {
      resultCount   = statRows.length;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hitCount      = statRows.filter((r: any) => r.isHit).length;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const devRows = statRows.filter((r: any) => r.deviationPct != null);
      avgDeviation  = devRows.length > 0
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? devRows.reduce((s: number, r: any) => s + Math.abs(Number(r.deviationPct)), 0) / devRows.length
        : 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const followed = statRows.filter((r: any) => r.userFollowedRecommendation === true);
      followCount    = followed.length;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      followWonCount = followed.filter((r: any) => r.isWon === true).length;
    }

    // 의뢰 목록 (확장된 필드)
    const { data } = await admin
      .from("BidRequest")
      .select([
        "id,title,orgName,deadline,budget",
        "recommendedBidPrice,predictedSajungRate,winProbability",
        "userBidPrice,userBidAt,userFollowedRecommendation",
        "userRank,userBidRate,userDrwtNo1,userDrwtNo2,userRemark",
        "openingDt,isWon,actualFinalPrice,actualSajungRate",
        "winnerName,totalBidders",
        "feeAmount,feeStatus,agreedFeeRate,agreedFeeAmount",
        "deviationPct,isHit,resultDetectedAt",
        "memo,konepsId,userId,annId,createdAt,contractAt,cancelledAt",
        "recommendedAt,agreedAt,paidAt,invoicedAt,userBidAt,resultDetectedAt",
        "createdIp,createdUserAgent,createdReferer,supabaseSessionId",
        "contractIp,contractUserAgent,bizRegNo,repName",
        "snapshotAvgSajungRate,snapshotSampleSize,snapshotConfidence,snapshotCategoryAvg,snapshotCategoryTotal",
      ].join(","))
      .order("createdAt", { ascending: false })
      .limit(50);
    requests = data ?? [];

    // User 배치 조회 (회사명, 사업자번호)
    if (requests.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userIds = [...new Set(requests.map((r: any) => r.userId).filter(Boolean))] as string[];
      if (userIds.length > 0) {
        const { data: users } = await admin
          .from("User")
          .select("id,bizName,bizNo,ownerName,plan,notifyEmail,notifyPhone,address,kakaoVerifiedName,kakaoVerifiedPhone,kakaoVerifiedAt,createdAt")
          .in("id", userIds);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        userMap = Object.fromEntries((users ?? []).map((u: any) => [u.id, u]));

        // CompanyProfile (G2B 자동조회 정보 — 주소·업종·실적 등)
        const { data: profiles } = await admin
          .from("CompanyProfile")
          .select("userId,bizNo,bizName,ceoName,address,establishedAt,employeeCount,mainCategory,subCategories,licenses,capitalAmount,creditScore")
          .in("userId", userIds);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        companyProfileMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.userId, p]));
      }

      // BidResult 배치 조회 (낙찰 업체 보완)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const annIds = [...new Set(requests.map((r: any) => r.annId).filter(Boolean))] as string[];
      if (annIds.length > 0) {
        const { data: bidResults } = await admin
          .from("BidResult")
          .select("annId,winnerName,finalPrice,numBidders,bidRate")
          .in("annId", annIds);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        bidResultMap = Object.fromEntries((bidResults ?? []).map((b: any) => [b.annId, b]));

        // Announcement.rawJson.opengDt fallback + 사정율 역산 base 데이터
        const { data: anns } = await admin
          .from("Announcement")
          .select("id, rawJson, bsisAmt, aValueTotal, sucsfbidLwltRate")
          .in("id", annIds);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        annOpengMap = Object.fromEntries((anns ?? []).map((a: any) => {
          const raw = a.rawJson ?? {};
          const dt = raw.opengDt ?? raw.rlOpengDt ?? null;
          return [a.id, dt];
        }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        annInfoMap = Object.fromEntries((anns ?? []).map((a: any) => [
          a.id,
          {
            bsisAmt: Number(a.bsisAmt ?? 0),
            aValueTotal: Number(a.aValueTotal ?? 0),
            lowerLimitRate: Number(a.sucsfbidLwltRate ?? 0),
          },
        ]));
      }
    }
  } catch {
    // BidRequest 테이블 미존재 (마이그레이션 전)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <AutoRefreshTrigger />
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>투찰 요청 관리</h2>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>AI 추천 의뢰 · 개찰 결과 · 수수료 현황</p>
      </div>

      {/* ── 요약 카드 5개 ── */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 10 }}>의뢰 현황</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          {[
            { label: "총 의뢰",        value: totalCount + "건",   color: "#1B3A6B" },
            { label: "개찰 대기",      value: pendingCount + "건", color: "#9CA3AF" },
            { label: "낙찰 성공",      value: wonCount + "건",     color: wonCount > 0 ? "#059669" : "#374151" },
            { label: "미낙찰",         value: lostCount + "건",    color: lostCount > 0 ? "#DC2626" : "#374151" },
            { label: "수수료 청구 대기", value: feeCount + "건",   color: feeCount > 0 ? "#D97706" : "#374151" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "20px" }}>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 적중률 통계 3카드 ── */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 10 }}>
          예측 정확도
          {resultCount > 0 && <span style={{ fontSize: 12, fontWeight: 400, color: "#9CA3AF", marginLeft: 8 }}>결과 수집 {resultCount}건 기준</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            {
              label: "±0.5% 적중률",
              value: resultCount > 0 ? `${((hitCount / resultCount) * 100).toFixed(1)}%` : "-",
              color: resultCount > 0
                ? (hitCount / resultCount) >= 0.3 ? "#059669" : (hitCount / resultCount) >= 0.15 ? "#D97706" : "#DC2626"
                : "#9CA3AF",
            },
            {
              label: "평균 예측 오차",
              value: resultCount > 0 ? `${avgDeviation.toFixed(4)}%p` : "-",
              color: resultCount > 0
                ? avgDeviation < 0.5 ? "#059669" : avgDeviation < 1.0 ? "#D97706" : "#DC2626"
                : "#9CA3AF",
            },
            {
              label: "추천 따른 낙찰률",
              value: followCount > 0 ? `${((followWonCount / followCount) * 100).toFixed(1)}%` : "-",
              color: followCount > 0
                ? (followWonCount / followCount) >= 0.3 ? "#059669" : (followWonCount / followCount) >= 0.15 ? "#D97706" : "#DC2626"
                : "#9CA3AF",
            },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "20px" }}>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 의뢰 목록 테이블 ── */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 14 }}>의뢰 목록 (최근 50건)</div>
        <RequestsTable requests={requests} userMap={userMap} companyProfileMap={companyProfileMap} bidResultMap={bidResultMap} annOpengMap={annOpengMap} annInfoMap={annInfoMap} />
      </div>
    </div>
  );
}
