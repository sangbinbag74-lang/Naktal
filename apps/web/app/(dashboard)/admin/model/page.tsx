import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";

export default async function AdminModelPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: dbUser } = await supabase.from("User").select("isAdmin").eq("supabaseId", user.id).single();
  if (!dbUser?.isAdmin) redirect("/dashboard");

  const admin = createAdminClient();

  // ─── 번호 추천 적중률 ────────────────────────────────────────────────────────
  const { data: outcomes } = await supabase
    .from("BidOutcome")
    .select("result,recommendHit,NumberRecommendation!recommendationId(category,modelVersion)")
    .not("result", "eq", "PENDING")
    .limit(1000);

  const categoryStats: Record<string, { total: number; hits: number }> = {};
  for (const o of outcomes ?? []) {
    const cat = (o as any).NumberRecommendation?.category ?? "unknown";
    if (!categoryStats[cat]) categoryStats[cat] = { total: 0, hits: 0 };
    categoryStats[cat].total++;
    if (o.recommendHit) categoryStats[cat].hits++;
  }
  const all = outcomes ?? [];
  const totalHits = all.filter((o) => o.recommendHit).length;
  const avgHitRate = all.length > 0 ? (totalHits / all.length * 100) : 0;

  // ─── 사정율 정확도 ───────────────────────────────────────────────────────────
  // BidPricePrediction + BidResult JOIN으로 실제 사정율 vs 예측 사정율 계산
  const { data: predictions } = await admin
    .from("BidPricePrediction")
    .select("annId,predictedSajungRate")
    .lt("expiresAt", new Date().toISOString()) // 만료된 예측 = 이미 지난 공고
    .limit(500);

  let sajungMAE: number | null = null;
  let sajungValidCount = 0;

  if (predictions && predictions.length > 0) {
    const annIds = predictions.map((p: any) => p.annId);
    // 실제 낙찰결과 조회
    const { data: bidResults } = await admin
      .from("BidResult")
      .select("annId,finalPrice,bidRate,Announcement!annId(budget)")
      .in("annId", annIds);

    if (bidResults && bidResults.length > 0) {
      const predMap = new Map<string, number>(
        predictions.map((p: any) => [p.annId, p.predictedSajungRate])
      );
      let totalAbsErr = 0;
      for (const r of bidResults) {
        const ann = (r as any).Announcement;
        if (!ann?.budget) continue;
        const budget = Number(ann.budget);
        if (!budget) continue;
        const finalPrice = Number(r.finalPrice);
        const bidRate = Number(r.bidRate);
        if (!finalPrice || !bidRate) continue;
        const estPrice = finalPrice / (bidRate / 100);
        const actualSajung = (estPrice / budget) * 100;
        if (actualSajung < 97 || actualSajung > 103) continue; // 유효범위 외 제외
        const predicted = predMap.get(r.annId);
        if (predicted == null) continue;
        totalAbsErr += Math.abs(actualSajung - predicted);
        sajungValidCount++;
      }
      if (sajungValidCount > 0) sajungMAE = totalAbsErr / sajungValidCount;
    }
  }

  // 사정율 통계 — 데이터 부족 발주처 (sampleSize < 10)
  const { data: thinStats } = await admin
    .from("SajungRateStat")
    .select("orgName,category,sampleSize")
    .lt("sampleSize", 10)
    .neq("orgName", "ALL")
    .order("sampleSize", { ascending: true })
    .limit(50);

  // ─── AIPrediction 적중률 ─────────────────────────────────────────────────────
  const { data: aiPreds } = await admin
    .from("AIPrediction")
    .select("isExact,isHit,isNearHit,deviationPct,resultFilledAt")
    .limit(2000);

  const aiTotal = aiPreds?.length ?? 0;
  const aiWithResult   = aiPreds?.filter((p: any) => p.resultFilledAt != null) ?? [];
  const aiExactCount   = aiWithResult.filter((p: any) => p.isExact).length;
  const aiHitCount     = aiWithResult.filter((p: any) => p.isHit).length;
  const aiNearHitCount = aiWithResult.filter((p: any) => p.isNearHit).length;
  const aiExactRate    = aiWithResult.length > 0 ? (aiExactCount   / aiWithResult.length) * 100 : 0;
  const aiHitRate      = aiWithResult.length > 0 ? (aiHitCount     / aiWithResult.length) * 100 : 0;
  const aiNearHitRate  = aiWithResult.length > 0 ? (aiNearHitCount / aiWithResult.length) * 100 : 0;
  const aiAvgDev = aiWithResult.length > 0
    ? aiWithResult.reduce((s: number, p: any) => s + Number(p.deviationPct ?? 0), 0) / aiWithResult.length
    : null;

  // SajungRateStat 전체 요약 + 신뢰도 분류
  const { data: statSummary } = await admin
    .from("SajungRateStat")
    .select("sampleSize,avg,stddev")
    .neq("orgName", "ALL");

  const totalStatRows = statSummary?.length ?? 0;
  const thinCount = thinStats?.length ?? 0;
  const avgSajung = statSummary && statSummary.length > 0
    ? statSummary.reduce((s: number, r: any) => s + r.avg, 0) / statSummary.length
    : null;

  // 신뢰도 구간별 발주처 수 계산
  let highCount = 0, mediumCount = 0, lowCount = 0;
  for (const r of statSummary ?? []) {
    const ss = r.sampleSize ?? 0;
    const sd = r.stddev ?? 99;
    if (ss >= 30 && sd <= 0.5) highCount++;
    else if (ss >= 10 && sd <= 1.0) mediumCount++;
    else lowCount++;
  }
  const confidenceTotal = highCount + mediumCount + lowCount;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>모델 성능 모니터링</h2>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>번호 추천 적중률 + 사정율 예측 정확도</p>
      </div>

      {/* ── 번호 추천 ── */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#374151", marginBottom: 10 }}>번호 추천 적중률</div>
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

      {/* ── AI 예측 적중률 ── */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#374151", marginBottom: 10 }}>AI 사정율 예측 적중률 (AIPrediction)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
          {[
            { label: "전체 예측 건수", value: aiTotal + "건", color: "#374151" },
            { label: "결과 수집 완료", value: aiWithResult.length + "건", color: "#374151" },
            { label: "완전 적중 (±0.2%)", value: aiWithResult.length > 0 ? `${aiExactRate.toFixed(1)}%` : "-", color: aiExactRate >= 20 ? "#059669" : aiExactRate >= 10 ? "#F59E0B" : "#DC2626" },
            { label: "적중 (±0.5%)", value: aiWithResult.length > 0 ? `${aiHitRate.toFixed(1)}%` : "-", color: aiHitRate >= 30 ? "#059669" : aiHitRate >= 15 ? "#F59E0B" : "#DC2626" },
            { label: "근접 적중 (±1.0%)", value: aiWithResult.length > 0 ? `${aiNearHitRate.toFixed(1)}%` : "-", color: aiNearHitRate >= 50 ? "#059669" : aiNearHitRate >= 30 ? "#F59E0B" : "#DC2626" },
            { label: "평균 편차 (%p)", value: aiAvgDev != null ? `${aiAvgDev.toFixed(3)}%p` : "-", color: aiAvgDev == null ? "#9CA3AF" : aiAvgDev < 0.5 ? "#059669" : aiAvgDev < 1.0 ? "#F59E0B" : "#DC2626" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "16px" }}>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 사정율 예측 정확도 ── */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#374151", marginBottom: 10 }}>사정율 예측 정확도</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
          {[
            {
              label: "예측 검증 건수",
              value: sajungValidCount > 0 ? `${sajungValidCount}건` : "-",
              color: "#374151",
            },
            {
              label: "예측 MAE (사정율 %)",
              value: sajungMAE != null ? `${sajungMAE.toFixed(3)}%` : "-",
              color: sajungMAE == null ? "#9CA3AF" : sajungMAE < 0.5 ? "#059669" : sajungMAE < 1.0 ? "#F59E0B" : "#DC2626",
            },
            {
              label: "평균 사정율 (DB)",
              value: avgSajung != null ? `${avgSajung.toFixed(2)}%` : "-",
              color: "#1B3A6B",
            },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "16px" }}>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* 신뢰도 분포 */}
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>
            신뢰도 구간 분포
            <span style={{ fontSize: 12, fontWeight: 400, color: "#9CA3AF", marginLeft: 8 }}>
              발주처 {confidenceTotal}개 기준
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
            {[
              { label: "HIGH", count: highCount, desc: "N≥30 & stddev≤0.5", bg: "#ECFDF5", color: "#059669", border: "#A7F3D0" },
              { label: "MEDIUM", count: mediumCount, desc: "N≥10 & stddev≤1.0", bg: "#FFFBEB", color: "#D97706", border: "#FCD34D" },
              { label: "LOW", count: lowCount, desc: "그 외 (데이터 부족)", bg: "#FEF2F2", color: "#DC2626", border: "#FECACA" },
            ].map(({ label, count, desc, bg, color, border }) => (
              <div key={label} style={{ background: bg, borderRadius: 10, border: `1px solid ${border}`, padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color, fontWeight: 700, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color }}>{count}개</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>{desc}</div>
                <div style={{ fontSize: 12, color, marginTop: 6, fontWeight: 600 }}>
                  {confidenceTotal > 0 ? ((count / confidenceTotal) * 100).toFixed(1) : "0.0"}%
                </div>
              </div>
            ))}
          </div>
          {/* 비율 바 */}
          {confidenceTotal > 0 && (
            <div style={{ height: 10, borderRadius: 5, overflow: "hidden", display: "flex" }}>
              <div style={{ width: `${(highCount / confidenceTotal) * 100}%`, background: "#059669" }} />
              <div style={{ width: `${(mediumCount / confidenceTotal) * 100}%`, background: "#D97706" }} />
              <div style={{ width: `${(lowCount / confidenceTotal) * 100}%`, background: "#DC2626" }} />
            </div>
          )}
          {/* 오픈 가능 기준 판단 */}
          <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8, background: sajungMAE !== null && sajungMAE <= 0.5 && highCount >= 10 ? "#ECFDF5" : "#FEF2F2", border: `1px solid ${sajungMAE !== null && sajungMAE <= 0.5 && highCount >= 10 ? "#A7F3D0" : "#FECACA"}`, fontSize: 13 }}>
            <strong>오픈 가능 기준:</strong>{" "}
            {sajungMAE !== null && sajungMAE <= 0.5 && highCount >= 10
              ? <span style={{ color: "#059669" }}>✅ 충족 — HIGH 발주처 MAE ≤ 0.5%p ({sajungMAE?.toFixed(3)}%), HIGH {highCount}개</span>
              : <span style={{ color: "#DC2626" }}>❌ 미충족 — HIGH 발주처 MAE ≤ 0.5%p 기준 ({sajungMAE != null ? `현재 ${sajungMAE.toFixed(3)}%` : "백테스트 데이터 없음"}, HIGH {highCount}개)</span>
            }
          </div>
        </div>

        {/* 데이터 부족 발주처 */}
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>
            데이터 부족 발주처 (N &lt; 10)
            <span style={{ fontSize: 12, fontWeight: 400, color: "#9CA3AF", marginLeft: 8 }}>
              {thinCount}건 / 전체 {totalStatRows}건
            </span>
          </div>
          {(thinStats ?? []).length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {(thinStats as any[]).map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0", borderBottom: "1px solid #F8FAFC", fontSize: 13 }}>
                  <div style={{ flex: 1, color: "#374151" }}>{r.orgName}</div>
                  <div style={{ color: "#9CA3AF", width: 80 }}>{r.category}</div>
                  <div style={{
                    fontSize: 11, fontWeight: 700,
                    background: r.sampleSize === 0 ? "#FEF2F2" : "#FFF7ED",
                    color: r.sampleSize === 0 ? "#DC2626" : "#C2410C",
                    padding: "2px 6px", borderRadius: 4,
                  }}>N={r.sampleSize}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "#9CA3AF", fontSize: 13 }}>
              {totalStatRows > 0 ? "모든 발주처 데이터 충분 (N≥10)" : "SajungRateStat 데이터 없음 — collect-sajung-stat.ts 실행 필요"}
            </div>
          )}
        </div>
      </div>

      <div style={{ background: "#EFF6FF", borderRadius: 12, padding: "16px 20px", fontSize: 13, color: "#1B3A6B" }}>
        <strong>판단 기준:</strong> 번호 적중률 12%+ → 정식 출시 / 사정율 MAE 0.5% 미만 → 우수 / 1% 이상 → 모델 재검토
      </div>
    </div>
  );
}
