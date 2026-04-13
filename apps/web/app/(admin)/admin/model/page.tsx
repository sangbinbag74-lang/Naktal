export const dynamic = "force-dynamic";

import { createAdminClient } from "@/lib/supabase/server";

export default async function AdminModelPage() {
  const admin = createAdminClient();

  // AIPrediction 통계
  const [
    { count: total },
    { count: exactCount },
    { count: hitCount },
    { count: nearHitCount },
    { count: resultFilledCount },
  ] = await Promise.all([
    admin.from("AIPrediction").select("id", { count: "exact", head: true }),
    admin.from("AIPrediction").select("id", { count: "exact", head: true }).eq("isExact", true),
    admin.from("AIPrediction").select("id", { count: "exact", head: true }).eq("isHit", true),
    admin.from("AIPrediction").select("id", { count: "exact", head: true }).eq("isNearHit", true),
    admin.from("AIPrediction").select("id", { count: "exact", head: true }).not("resultFilledAt", "is", null),
  ]);

  const evaluated = resultFilledCount ?? 0;
  const pct = (n: number | null) =>
    evaluated > 0 ? ((n ?? 0) / evaluated * 100).toFixed(1) + "%" : "-";

  // 최근 예측 20건
  const { data: recent } = await admin
    .from("AIPrediction")
    .select("id,title,orgName,predictedSajungRate,actualSajungRate,deviationPct,isExact,isHit,isNearHit,predictedAt,resultFilledAt")
    .order("predictedAt", { ascending: false })
    .limit(20);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>운영 현황</h2>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>AI 사정율 예측 적중률 모니터링</p>
      </div>

      {/* 통계 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        {[
          { label: "전체 예측", value: String(total ?? 0) + "건", color: "#1B3A6B" },
          { label: "결과 수신", value: String(evaluated) + "건", color: "#374151" },
          { label: "완전 적중 ±0.2%", value: pct(exactCount), color: "#7C3AED" },
          { label: "적중 ±0.5%", value: pct(hitCount), color: "#059669" },
          { label: "근접 ±1.0%", value: pct(nearHitCount), color: "#D97706" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "20px" }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* 최근 예측 목록 */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 14 }}>
          최근 예측 20건
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                {["공고명", "발주처", "예측사정율", "실제사정율", "편차", "결과", "예측일"].map((h) => (
                  <th key={h} style={{ padding: "10px 10px", textAlign: "left", color: "#374151", fontWeight: 600, borderBottom: "2px solid #E8ECF2", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(recent ?? []).map((r: any) => {
                const badge = r.isExact ? { label: "완전적중", color: "#7C3AED" }
                  : r.isHit ? { label: "적중", color: "#059669" }
                  : r.isNearHit ? { label: "근접", color: "#D97706" }
                  : r.resultFilledAt ? { label: "미적중", color: "#DC2626" }
                  : { label: "결과대기", color: "#94A3B8" };
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "8px 10px", color: "#0F172A", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</td>
                    <td style={{ padding: "8px 10px", color: "#374151", whiteSpace: "nowrap" }}>{r.orgName}</td>
                    <td style={{ padding: "8px 10px", color: "#374151", fontFamily: "monospace" }}>{Number(r.predictedSajungRate).toFixed(2)}%</td>
                    <td style={{ padding: "8px 10px", color: "#374151", fontFamily: "monospace" }}>{r.actualSajungRate ? Number(r.actualSajungRate).toFixed(2) + "%" : "-"}</td>
                    <td style={{ padding: "8px 10px", color: "#374151", fontFamily: "monospace" }}>{r.deviationPct ? "±" + Number(r.deviationPct).toFixed(2) + "%" : "-"}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 5, background: badge.color + "1a", color: badge.color, fontWeight: 700 }}>
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ padding: "8px 10px", color: "#6B7280", whiteSpace: "nowrap" }}>
                      {new Date(r.predictedAt).toLocaleDateString("ko-KR")}
                    </td>
                  </tr>
                );
              })}
              {(recent ?? []).length === 0 && (
                <tr><td colSpan={7} style={{ padding: "20px", color: "#9CA3AF", textAlign: "center" }}>예측 데이터 없음</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
