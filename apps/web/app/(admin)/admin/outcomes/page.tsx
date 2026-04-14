import { createAdminClient } from "@/lib/supabase/server";

export default async function AdminOutcomesPage() {
  const admin = createAdminClient();

  // ─── 결과별 집계 ─────────────────────────────────────────────────────────────
  const [
    { count: totalCount },
    { count: winCount },
    { count: loseCount },
    { count: pendingCount },
  ] = await Promise.all([
    admin.from("BidOutcome").select("id", { count: "exact", head: true }),
    admin.from("BidOutcome").select("id", { count: "exact", head: true }).eq("result", "WIN"),
    admin.from("BidOutcome").select("id", { count: "exact", head: true }).eq("result", "LOSE"),
    admin.from("BidOutcome").select("id", { count: "exact", head: true }).eq("result", "PENDING"),
  ]);

  // ─── PENDING 목록 (오래된 순 20건) ──────────────────────────────────────────
  const { data: pendingList } = await admin
    .from("BidOutcome")
    .select("id,annId,bidAt")
    .eq("result", "PENDING")
    .order("bidAt", { ascending: true })
    .limit(20);

  // ─── 전체 이력 최근 100건 ────────────────────────────────────────────────────
  const { data: recent } = await admin
    .from("BidOutcome")
    .select("id,annId,result,recommendHit,bidAt,bonusGranted,bidPrice,bidRate")
    .order("bidAt", { ascending: false })
    .limit(100);

  const resultLabels: Record<string, string> = { WIN: "낙찰", LOSE: "유찰", DISQUALIFIED: "탈락", PENDING: "대기중" };
  const resultColors: Record<string, string> = { WIN: "#059669", LOSE: "#DC2626", DISQUALIFIED: "#9CA3AF", PENDING: "#D97706" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>투찰 결과 현황</h2>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>사용자 투찰 이력 및 미결 건 관리</p>
      </div>

      {/* ── 결과 통계 4카드 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "전체 투찰 건수", value: (totalCount ?? 0) + "건", color: "#1B3A6B" },
          { label: "낙찰 (WIN)", value: (winCount ?? 0) + "건", color: "#059669" },
          { label: "유찰 (LOSE)", value: (loseCount ?? 0) + "건", color: "#DC2626" },
          { label: "미결 (PENDING)", value: (pendingCount ?? 0) + "건", color: (pendingCount ?? 0) > 10 ? "#D97706" : "#374151" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "20px" }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── PENDING 목록 ── */}
      {(pendingList ?? []).length > 0 && (
        <div style={{ background: "#FFFBEB", borderRadius: 14, border: "1px solid #FCD34D", padding: "20px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#92400E", marginBottom: 14 }}>
            미결 투찰 목록 ({pendingList?.length}건) — 오래된 순
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {["공고번호", "투찰일", "경과일"].map((h) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#78350F", fontWeight: 600, borderBottom: "1px solid #FDE68A" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(pendingList as any[]).map((r, i) => {
                const elapsedDays = Math.floor((Date.now() - new Date(r.bidAt).getTime()) / 86400000);
                return (
                  <tr key={i} style={{ borderBottom: "1px solid #FEF3C7" }}>
                    <td style={{ padding: "7px 12px", color: "#374151", fontFamily: "monospace" }}>{String(r.annId).slice(0, 16)}</td>
                    <td style={{ padding: "7px 12px", color: "#6B7280" }}>{new Date(r.bidAt).toLocaleDateString("ko-KR")}</td>
                    <td style={{ padding: "7px 12px" }}>
                      <span style={{ fontWeight: 700, color: elapsedDays >= 7 ? "#DC2626" : "#D97706" }}>D+{elapsedDays}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 전체 이력 테이블 ── */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 14 }}>최근 투찰 이력 (최근 100건)</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                {["투찰일", "공고번호", "투찰금액", "투찰률", "결과", "추천 적중", "보너스"].map((h) => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "#374151", fontWeight: 600, borderBottom: "2px solid #E8ECF2", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(recent ?? []).map((r: any) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={{ padding: "8px 12px", color: "#6B7280", whiteSpace: "nowrap" }}>
                    {new Date(r.bidAt).toLocaleDateString("ko-KR")}
                  </td>
                  <td style={{ padding: "8px 12px", color: "#374151", fontFamily: "monospace" }}>
                    {String(r.annId).slice(0, 14)}
                  </td>
                  <td style={{ padding: "8px 12px", color: "#374151", whiteSpace: "nowrap" }}>
                    {r.bidPrice
                      ? Number(r.bidPrice).toLocaleString("ko-KR") + "원"
                      : <span style={{ color: "#D1D5DB" }}>-</span>}
                  </td>
                  <td style={{ padding: "8px 12px", color: "#374151" }}>
                    {r.bidRate
                      ? Number(r.bidRate).toFixed(3) + "%"
                      : <span style={{ color: "#D1D5DB" }}>-</span>}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 5, background: (resultColors[r.result] ?? "#374151") + "1a", color: resultColors[r.result] ?? "#374151", fontWeight: 700 }}>
                      {resultLabels[r.result] ?? r.result}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    {r.recommendHit === null || r.recommendHit === undefined
                      ? <span style={{ color: "#D1D5DB" }}>-</span>
                      : <span style={{ color: r.recommendHit ? "#059669" : "#DC2626", fontWeight: 600 }}>
                          {r.recommendHit ? "적중" : "미적중"}
                        </span>}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    {r.bonusGranted
                      ? <span style={{ color: "#059669", fontWeight: 600 }}>✓ 지급</span>
                      : <span style={{ color: "#D1D5DB" }}>-</span>}
                  </td>
                </tr>
              ))}
              {(recent ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: "20px", color: "#9CA3AF", textAlign: "center" }}>투찰 이력 없음</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
