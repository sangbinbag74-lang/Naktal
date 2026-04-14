import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const feeStatusLabel: Record<string, { label: string; color: string }> = {
  pending:   { label: "대기",   color: "#9CA3AF" },
  invoiced:  { label: "청구",   color: "#D97706" },
  paid:      { label: "수납",   color: "#059669" },
  cancelled: { label: "취소",   color: "#DC2626" },
};

export default async function AdminRequestsPage() {
  const admin = createAdminClient();

  // ─── 집계 ────────────────────────────────────────────────────────────────────
  let totalCount = 0, agreedCount = 0, wonCount = 0, invoicedCount = 0, paidCount = 0;
  let totalFeeAmount = 0;
  let requests: any[] = [];

  try {
    const [
      { count: t },
      { count: a },
      { count: w },
      { count: inv },
      { count: p },
    ] = await Promise.all([
      admin.from("BidRequest").select("id", { count: "exact", head: true }),
      admin.from("BidRequest").select("id", { count: "exact", head: true }).not("agreedAt", "is", null),
      admin.from("BidRequest").select("id", { count: "exact", head: true }).eq("isWon", true),
      admin.from("BidRequest").select("id", { count: "exact", head: true }).eq("feeStatus", "invoiced"),
      admin.from("BidRequest").select("id", { count: "exact", head: true }).eq("feeStatus", "paid"),
    ]);
    totalCount   = t ?? 0;
    agreedCount  = a ?? 0;
    wonCount     = w ?? 0;
    invoicedCount = inv ?? 0;
    paidCount    = p ?? 0;

    const { data: feeRows } = await admin
      .from("BidRequest")
      .select("feeAmount")
      .eq("feeStatus", "paid");
    totalFeeAmount = (feeRows ?? []).reduce((s: number, r: any) => s + Number(r.feeAmount ?? 0), 0);

    const { data } = await admin
      .from("BidRequest")
      .select("id,title,orgName,deadline,recommendedBidPrice,userBidPrice,userFollowedRecommendation,isWon,actualSajungRate,predictedSajungRate,deviationPct,isHit,feeStatus,feeAmount,agreedAt,recommendedAt")
      .order("recommendedAt", { ascending: false })
      .limit(50);
    requests = data ?? [];
  } catch {
    // BidRequest 테이블 미존재 시 (마이그레이션 전)
  }

  const fmt = (n: number | null | undefined) =>
    n != null ? Number(n).toLocaleString("ko-KR") + "원" : "-";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>투찰 요청 관리</h2>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>BidRequest · AI 추천 동의 · 낙찰 결과 · 수수료 현황</p>
      </div>

      {/* ── 집계 카드 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        {[
          { label: "전체 요청",  value: totalCount + "건",    color: "#374151" },
          { label: "동의 완료",  value: agreedCount + "건",   color: "#1B3A6B" },
          { label: "낙찰",       value: wonCount + "건",      color: wonCount > 0 ? "#059669" : "#374151" },
          { label: "수수료 청구", value: invoicedCount + "건", color: invoicedCount > 0 ? "#D97706" : "#374151" },
          { label: "수수료 수납", value: paidCount + "건",     color: paidCount > 0 ? "#059669" : "#374151" },
          { label: "수납 합계",  value: totalFeeAmount > 0 ? (totalFeeAmount / 10000).toFixed(0) + "만원" : "-", color: totalFeeAmount > 0 ? "#059669" : "#9CA3AF" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "16px" }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── 요청 목록 테이블 ── */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 14 }}>최근 투찰 요청 (최근 50건)</div>
        {requests.length === 0 ? (
          <div style={{ color: "#9CA3AF", fontSize: 13 }}>
            데이터 없음 — BidRequest 마이그레이션 후 데이터가 표시됩니다
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  {["요청일", "공고명", "발주처", "마감일", "AI 추천가", "실제 투찰가", "추천 따름", "낙찰", "예측편차", "수수료", "수수료 상태"].map((h) => (
                    <th key={h} style={{ padding: "9px 10px", textAlign: "left", color: "#374151", fontWeight: 600, borderBottom: "2px solid #E8ECF2", whiteSpace: "nowrap", fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requests.map((r: any, i: number) => {
                  const fee = feeStatusLabel[r.feeStatus] ?? { label: r.feeStatus, color: "#9CA3AF" };
                  const wonColor = r.isWon === true ? "#059669" : r.isWon === false ? "#DC2626" : "#9CA3AF";
                  const wonLabel = r.isWon === true ? "낙찰" : r.isWon === false ? "미낙찰" : "-";
                  const followColor = r.userFollowedRecommendation === true ? "#059669" : r.userFollowedRecommendation === false ? "#DC2626" : "#9CA3AF";
                  const followLabel = r.userFollowedRecommendation === true ? "Y" : r.userFollowedRecommendation === false ? "N" : "-";
                  const hitColor = r.isHit === true ? "#059669" : r.isHit === false ? "#DC2626" : "#9CA3AF";
                  return (
                    <tr key={r.id ?? i} style={{ borderBottom: "1px solid #F1F5F9" }}>
                      <td style={{ padding: "8px 10px", color: "#6B7280", whiteSpace: "nowrap" }}>
                        {new Date(r.recommendedAt).toLocaleDateString("ko-KR")}
                      </td>
                      <td style={{ padding: "8px 10px", color: "#374151", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.title}>
                        {r.title}
                      </td>
                      <td style={{ padding: "8px 10px", color: "#374151", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.orgName}>
                        {r.orgName}
                      </td>
                      <td style={{ padding: "8px 10px", color: "#6B7280", whiteSpace: "nowrap" }}>
                        {new Date(r.deadline).toLocaleDateString("ko-KR")}
                      </td>
                      <td style={{ padding: "8px 10px", color: "#1B3A6B", fontWeight: 600, whiteSpace: "nowrap" }}>
                        {fmt(r.recommendedBidPrice)}
                      </td>
                      <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                        {r.userBidPrice ? fmt(r.userBidPrice) : <span style={{ color: "#D1D5DB" }}>미입력</span>}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: followColor }}>{followLabel}</span>
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: wonColor, background: wonColor + "1a", padding: "2px 7px", borderRadius: 5 }}>
                          {wonLabel}
                        </span>
                      </td>
                      <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                        {r.deviationPct != null
                          ? <span style={{ color: hitColor, fontWeight: 600 }}>{Number(r.deviationPct).toFixed(3)}%p</span>
                          : <span style={{ color: "#D1D5DB" }}>-</span>}
                      </td>
                      <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                        {r.feeAmount ? fmt(r.feeAmount) : <span style={{ color: "#D1D5DB" }}>-</span>}
                      </td>
                      <td style={{ padding: "8px 10px" }}>
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
