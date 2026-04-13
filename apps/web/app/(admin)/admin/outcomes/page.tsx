export const dynamic = "force-dynamic";

import { createAdminClient } from "@/lib/supabase/server";

export default async function AdminOutcomesPage() {
  const admin = createAdminClient();

  const [
    { count: total },
    { count: winCount },
    { count: lossCount },
    { count: pendingCount },
  ] = await Promise.all([
    admin.from("BidOutcome").select("id", { count: "exact", head: true }),
    admin.from("BidOutcome").select("id", { count: "exact", head: true }).eq("result", "WIN"),
    admin.from("BidOutcome").select("id", { count: "exact", head: true }).eq("result", "LOSS"),
    admin.from("BidOutcome").select("id", { count: "exact", head: true }).eq("result", "PENDING"),
  ]);

  const evaluated = (winCount ?? 0) + (lossCount ?? 0);
  const winRate = evaluated > 0 ? ((winCount ?? 0) / evaluated * 100).toFixed(1) + "%" : "-";

  const { data: list } = await admin
    .from("BidOutcome")
    .select("id,annId,result,bidRate,actualBidRate,recommendHit,numBidders,createdAt,userId")
    .order("createdAt", { ascending: false })
    .limit(50);

  const resultColors: Record<string, string> = { WIN: "#059669", LOSS: "#DC2626", PENDING: "#D97706", SKIP: "#6B7280" };
  const resultLabels: Record<string, string> = { WIN: "낙찰", LOSS: "미낙찰", PENDING: "결과대기", SKIP: "스킵" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>투찰 현황</h2>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>사용자 투찰 결과 데이터 관리</p>
      </div>

      {/* 통계 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "전체 투찰", value: String(total ?? 0) + "건", color: "#1B3A6B" },
          { label: "낙찰", value: String(winCount ?? 0) + "건", color: "#059669" },
          { label: "미낙찰", value: String(lossCount ?? 0) + "건", color: "#DC2626" },
          { label: "낙찰률", value: winRate, color: "#7C3AED" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "20px" }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* 투찰 목록 */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 14 }}>
          최근 투찰 이력 (50건)
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                {["공고ID", "투찰률", "실제낙찰률", "추천적중", "참여자수", "결과", "날짜"].map((h) => (
                  <th key={h} style={{ padding: "10px 10px", textAlign: "left", color: "#374151", fontWeight: 600, borderBottom: "2px solid #E8ECF2", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(list ?? []).map((r: any) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={{ padding: "8px 10px", color: "#374151", fontFamily: "monospace", fontSize: 11 }}>{r.annId?.slice(0, 12)}...</td>
                  <td style={{ padding: "8px 10px", color: "#374151", fontFamily: "monospace" }}>{Number(r.bidRate).toFixed(3)}%</td>
                  <td style={{ padding: "8px 10px", color: "#374151", fontFamily: "monospace" }}>{r.actualBidRate ? Number(r.actualBidRate).toFixed(3) + "%" : "-"}</td>
                  <td style={{ padding: "8px 10px" }}>
                    {r.recommendHit === null ? "-" : (
                      <span style={{ color: r.recommendHit ? "#059669" : "#DC2626", fontWeight: 700 }}>
                        {r.recommendHit ? "✓" : "✗"}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "8px 10px", color: "#374151" }}>{r.numBidders ?? "-"}</td>
                  <td style={{ padding: "8px 10px" }}>
                    <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 5, background: (resultColors[r.result] ?? "#374151") + "1a", color: resultColors[r.result] ?? "#374151", fontWeight: 700 }}>
                      {resultLabels[r.result] ?? r.result}
                    </span>
                  </td>
                  <td style={{ padding: "8px 10px", color: "#6B7280", whiteSpace: "nowrap" }}>
                    {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                  </td>
                </tr>
              ))}
              {(list ?? []).length === 0 && (
                <tr><td colSpan={7} style={{ padding: "20px", color: "#9CA3AF", textAlign: "center" }}>투찰 데이터 없음</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
