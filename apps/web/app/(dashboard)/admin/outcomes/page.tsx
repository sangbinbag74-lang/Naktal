import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminOutcomesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: dbUser } = await supabase.from("User").select("isAdmin").eq("supabaseId", user.id).single();
  if (!dbUser?.isAdmin) redirect("/dashboard");

  const { data: counts } = await supabase.rpc("count_bid_outcomes_by_result").catch(() => ({ data: null }));

  const { data: recent } = await supabase
    .from("BidOutcome")
    .select("id,userId,annId,result,recommendHit,bidAt,bonusGranted")
    .order("bidAt", { ascending: false })
    .limit(50);

  const resultLabels: Record<string, string> = { WIN: "낙찰", LOSE: "유찰", DISQUALIFIED: "탈락", PENDING: "대기중" };
  const resultColors: Record<string, string> = { WIN: "#059669", LOSE: "#DC2626", DISQUALIFIED: "#9CA3AF", PENDING: "#F59E0B" };

  const pending = (recent ?? []).filter((r) => r.result === "PENDING").length;
  const total = recent?.length ?? 0;
  const inputRate = total > 0 ? ((total - pending) / total * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>투찰 결과 현황</h2>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>사용자 결과 입력률 및 최근 투찰 이력</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[
          { label: "최근 50건 중 대기", value: pending + "건" },
          { label: "결과 입력률", value: inputRate.toFixed(1) + "%" },
          { label: "목표 입력률", value: "30%+" },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "16px" }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1B3A6B" }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>최근 투찰 이력</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                {["투찰일", "공고번호", "결과", "추천 적중", "보너스 지급"].map((h) => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "#374151", fontWeight: 600, borderBottom: "2px solid #E8ECF2" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(recent ?? []).map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={{ padding: "8px 12px", color: "#6B7280" }}>{new Date(r.bidAt).toLocaleDateString("ko-KR")}</td>
                  <td style={{ padding: "8px 12px", color: "#374151", fontFamily: "monospace" }}>{r.annId.slice(0, 12)}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 5, background: "#F8FAFC", color: resultColors[r.result] ?? "#374151", fontWeight: 700 }}>
                      {resultLabels[r.result] ?? r.result}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    {r.recommendHit === null || r.recommendHit === undefined ? <span style={{ color: "#D1D5DB" }}>-</span>
                      : <span style={{ color: r.recommendHit ? "#059669" : "#DC2626", fontWeight: 600 }}>{r.recommendHit ? "적중" : "미적중"}</span>}
                  </td>
                  <td style={{ padding: "8px 12px" }}>{r.bonusGranted ? <span style={{ color: "#059669" }}>✓ 지급</span> : <span style={{ color: "#D1D5DB" }}>-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
