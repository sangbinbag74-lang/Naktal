import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminModelPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: dbUser } = await supabase.from("User").select("isAdmin").eq("supabaseId", user.id).single();
  if (!dbUser?.isAdmin) redirect("/dashboard");

  // 업종별 적중률
  const { data: outcomes } = await supabase
    .from("BidOutcome")
    .select("result,recommendHit,NumberRecommendation!recommendationId(category,modelVersion)")
    .not("result", "eq", "PENDING")
    .limit(1000);

  // 집계
  const categoryStats: Record<string, { total: number; hits: number }> = {};
  for (const o of outcomes ?? []) {
    const cat = (o as any).NumberRecommendation?.category ?? "unknown";
    if (!categoryStats[cat]) categoryStats[cat] = { total: 0, hits: 0 };
    categoryStats[cat].total++;
    if (o.recommendHit) categoryStats[cat].hits++;
  }

  const all = (outcomes ?? []);
  const totalHits = all.filter((o) => o.recommendHit).length;
  const avgHitRate = all.length > 0 ? (totalHits / all.length * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>모델 성능 모니터링</h2>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>BidOutcome 기반 번호 추천 적중률 집계</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[
          { label: "전체 결과 건수", value: all.length + "건" },
          { label: "추천 적중 건수", value: totalHits + "건" },
          { label: "전체 적중률", value: avgHitRate.toFixed(1) + "%" },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "16px" }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: avgHitRate >= 12 ? "#059669" : avgHitRate >= 8 ? "#F59E0B" : "#DC2626" }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>업종별 적중률</div>
        {Object.entries(categoryStats).sort((a, b) => b[1].total - a[1].total).map(([cat, s]) => {
          const rate = s.total > 0 ? (s.hits / s.total * 100) : 0;
          return (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #F1F5F9" }}>
              <div style={{ flex: 1, fontSize: 13, color: "#374151" }}>{cat}</div>
              <div style={{ fontSize: 13, color: "#9CA3AF" }}>{s.total}건</div>
              <div style={{ width: 120, height: 8, background: "#F1F5F9", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: rate + "%", height: "100%", background: rate >= 12 ? "#059669" : rate >= 8 ? "#F59E0B" : "#DC2626", borderRadius: 4 }} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", width: 40, textAlign: "right" }}>{rate.toFixed(1)}%</div>
            </div>
          );
        })}
        {Object.keys(categoryStats).length === 0 && <div style={{ color: "#9CA3AF", fontSize: 13 }}>데이터가 아직 없습니다.</div>}
      </div>

      <div style={{ background: "#EFF6FF", borderRadius: 12, padding: "16px 20px", fontSize: 13, color: "#1B3A6B" }}>
        <strong>판단 기준:</strong> 적중률 12%+ → 정식 출시 진행 / 10~12% → 베타 연장 고려 / 10% 미만 → 모델 재검토 필요
      </div>
    </div>
  );
}
