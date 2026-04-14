import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminRequestsPage() {
  const admin = createAdminClient();

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

    if (statRows && statRows.length > 0) {
      resultCount   = statRows.length;
      hitCount      = statRows.filter((r: any) => r.isHit).length;
      const devRows = statRows.filter((r: any) => r.deviationPct != null);
      avgDeviation  = devRows.length > 0
        ? devRows.reduce((s: number, r: any) => s + Math.abs(Number(r.deviationPct)), 0) / devRows.length
        : 0;
      const followed = statRows.filter((r: any) => r.userFollowedRecommendation === true);
      followCount    = followed.length;
      followWonCount = followed.filter((r: any) => r.isWon === true).length;
    }

    // 목록
    const { data } = await admin
      .from("BidRequest")
      .select("id,title,orgName,deadline,recommendedBidPrice,userBidPrice,openingDt,isWon,feeAmount,feeStatus,agreedAt,recommendedAt")
      .order("recommendedAt", { ascending: false })
      .limit(50);
    requests = data ?? [];
  } catch {
    // BidRequest 테이블 미존재 (마이그레이션 전)
  }

  const fmtPrice = (n: any) =>
    n != null ? Number(n).toLocaleString("ko-KR") + "원" : "-";

  const feeStatusStyle: Record<string, { label: string; color: string }> = {
    pending:   { label: "대기",   color: "#9CA3AF" },
    invoiced:  { label: "청구중", color: "#D97706" },
    paid:      { label: "수납",   color: "#059669" },
    cancelled: { label: "취소",   color: "#DC2626" },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
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
              value: resultCount > 0 ? `${avgDeviation.toFixed(3)}%p` : "-",
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
        {requests.length === 0 ? (
          <div style={{ color: "#9CA3AF", fontSize: 13 }}>데이터 없음 — BidRequest 마이그레이션 후 표시됩니다</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  {["공고명", "발주처", "마감일", "추천금액", "실투찰금액", "개찰일", "낙찰", "수수료", "상태"].map((h) => (
                    <th key={h} style={{ padding: "9px 12px", textAlign: "left", color: "#374151", fontWeight: 600, borderBottom: "2px solid #E8ECF2", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requests.map((r: any, i: number) => {
                  const fee = feeStatusStyle[r.feeStatus as string] ?? { label: r.feeStatus ?? "-", color: "#9CA3AF" };
                  const wonColor = r.isWon === true ? "#059669" : r.isWon === false ? "#DC2626" : "#9CA3AF";
                  const wonLabel = r.isWon === true ? "낙찰" : r.isWon === false ? "미낙찰" : "대기";
                  return (
                    <tr key={r.id ?? i} style={{ borderBottom: "1px solid #F1F5F9" }}>
                      <td style={{ padding: "8px 12px", color: "#374151", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.title}>
                        {r.title}
                      </td>
                      <td style={{ padding: "8px 12px", color: "#374151", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.orgName}>
                        {r.orgName}
                      </td>
                      <td style={{ padding: "8px 12px", color: "#6B7280", whiteSpace: "nowrap" }}>
                        {new Date(r.deadline).toLocaleDateString("ko-KR")}
                      </td>
                      <td style={{ padding: "8px 12px", color: "#1B3A6B", fontWeight: 600, whiteSpace: "nowrap" }}>
                        {fmtPrice(r.recommendedBidPrice)}
                      </td>
                      <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                        {r.userBidPrice
                          ? <span style={{ color: "#374151" }}>{fmtPrice(r.userBidPrice)}</span>
                          : <span style={{ color: "#D1D5DB" }}>미입력</span>}
                      </td>
                      <td style={{ padding: "8px 12px", color: "#6B7280", whiteSpace: "nowrap" }}>
                        {r.openingDt
                          ? new Date(r.openingDt).toLocaleDateString("ko-KR")
                          : <span style={{ color: "#D1D5DB" }}>-</span>}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: wonColor, background: wonColor + "1a", padding: "2px 7px", borderRadius: 5 }}>
                          {wonLabel}
                        </span>
                      </td>
                      <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                        {r.feeAmount
                          ? <span style={{ color: "#374151", fontWeight: 600 }}>{fmtPrice(r.feeAmount)}</span>
                          : <span style={{ color: "#D1D5DB" }}>-</span>}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: fee.color, background: fee.color + "1a", padding: "2px 7px", borderRadius: 5 }}>
                          {fee.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
