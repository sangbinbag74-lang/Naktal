import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type BppAnn = {
  budget: string;
  orgName: string;
  category: string;
  bidResult: { finalPrice: string; bidRate: string } | null;
};
type BppRow = {
  annId: string;
  predictedSajungRate: number;
  createdAt: string;
  announcement: BppAnn | null;
};

export default async function AdminAccuracyPage() {
  const admin = createAdminClient();

  // ─── AIPrediction 적중률 ─────────────────────────────────────────────────────
  const { data: aiPreds } = await admin
    .from("AIPrediction")
    .select("isExact,isHit,isNearHit,deviationPct,resultFilledAt")
    .limit(2000);

  const aiTotal        = aiPreds?.length ?? 0;
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

  // ─── AIPrediction 최근 20건 ──────────────────────────────────────────────────
  const { data: recentPreds } = await admin
    .from("AIPrediction")
    .select("title,orgName,budget,predictedSajungRate,actualSajungRate,deviationPct,isExact,isHit,isNearHit,predictedAt,resultFilledAt")
    .order("predictedAt", { ascending: false })
    .limit(20);

  // ─── SajungRateStat 신뢰도 분포 ─────────────────────────────────────────────
  const { data: statSummary } = await admin
    .from("SajungRateStat")
    .select("sampleSize,avg,stddev")
    .neq("orgName", "ALL");

  const totalStatRows = statSummary?.length ?? 0;
  const avgSajung = statSummary && statSummary.length > 0
    ? statSummary.reduce((s: number, r: any) => s + r.avg, 0) / statSummary.length
    : null;

  let highCount = 0, mediumCount = 0, lowCount = 0;
  for (const r of statSummary ?? []) {
    const ss = r.sampleSize ?? 0;
    const sd = r.stddev ?? 99;
    if (ss >= 30 && sd <= 0.5) highCount++;
    else if (ss >= 10 && sd <= 1.0) mediumCount++;
    else lowCount++;
  }
  const confidenceTotal = highCount + mediumCount + lowCount;

  // ─── BidPricePrediction 백테스트 ──────────────────────────────────────────────
  const { data: bppRows } = await admin
    .from("BidPricePrediction")
    .select(`
      annId,
      predictedSajungRate,
      createdAt,
      announcement:Announcement(
        budget,
        orgName,
        category,
        bidResult:BidResult(finalPrice, bidRate)
      )
    `)
    .order("createdAt", { ascending: false })
    .limit(500);

  const bppTyped = (bppRows ?? []) as unknown as BppRow[];
  const bppWithResult = bppTyped.filter(
    (r) => r.announcement?.bidResult != null &&
      Number(r.announcement.budget) > 0 &&
      Number(r.announcement.bidResult.bidRate) > 0
  );

  type BppCalc = { predictedSajungRate: number; actualSajungRate: number; deviation: number; isHit: boolean; isNear: boolean; orgName: string; category: string; createdAt: string };
  const bppCalc: BppCalc[] = bppWithResult.map((r) => {
    const budget = Number(r.announcement!.budget);
    const finalPrice = Number(r.announcement!.bidResult!.finalPrice);
    const bidRate = Number(r.announcement!.bidResult!.bidRate);
    const actualSajungRate = (finalPrice / (bidRate / 100)) / budget * 100;
    const deviation = Math.abs(r.predictedSajungRate - actualSajungRate);
    return {
      predictedSajungRate: r.predictedSajungRate,
      actualSajungRate,
      deviation,
      isHit: deviation <= 0.5,
      isNear: deviation <= 1.0,
      orgName: r.announcement!.orgName,
      category: r.announcement!.category,
      createdAt: r.createdAt,
    };
  });

  const bppTotal    = bppTyped.length;
  const bppCompared = bppCalc.length;
  const bppHitCount  = bppCalc.filter((r) => r.isHit).length;
  const bppNearCount = bppCalc.filter((r) => r.isNear).length;
  const bppHitRate   = bppCompared > 0 ? (bppHitCount  / bppCompared) * 100 : 0;
  const bppNearRate  = bppCompared > 0 ? (bppNearCount / bppCompared) * 100 : 0;
  const bppMAE       = bppCompared > 0
    ? bppCalc.reduce((s, r) => s + r.deviation, 0) / bppCompared
    : null;

  // 편차 구간
  const bppZone0  = bppCalc.filter((r) => r.deviation <= 0.5).length;
  const bppZone1  = bppCalc.filter((r) => r.deviation > 0.5 && r.deviation <= 1.0).length;
  const bppZone2  = bppCalc.filter((r) => r.deviation > 1.0 && r.deviation <= 2.0).length;
  const bppZone3  = bppCalc.filter((r) => r.deviation > 2.0).length;

  const bppRecent = bppCalc.slice(0, 20);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>정확도 분석</h2>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>AI 사정율 예측 적중률 · 최근 예측 내역 · 발주처 신뢰도</p>
      </div>

      {/* ── AIPrediction 적중률 6카드 ── */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 10 }}>AI 사정율 예측 적중률</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
          {[
            { label: "전체 예측", value: aiTotal + "건", color: "#374151" },
            { label: "결과 수집", value: aiWithResult.length + "건", color: "#374151" },
            { label: "완전 적중 ±0.2%", value: aiWithResult.length > 0 ? `${aiExactRate.toFixed(1)}%` : "-", color: aiExactRate >= 20 ? "#059669" : aiExactRate >= 10 ? "#D97706" : "#DC2626" },
            { label: "적중 ±0.5%", value: aiWithResult.length > 0 ? `${aiHitRate.toFixed(1)}%` : "-", color: aiHitRate >= 30 ? "#059669" : aiHitRate >= 15 ? "#D97706" : "#DC2626" },
            { label: "근접 ±1.0%", value: aiWithResult.length > 0 ? `${aiNearHitRate.toFixed(1)}%` : "-", color: aiNearHitRate >= 50 ? "#059669" : aiNearHitRate >= 30 ? "#D97706" : "#DC2626" },
            { label: "평균 편차", value: aiAvgDev != null ? `${aiAvgDev.toFixed(3)}%p` : "-", color: aiAvgDev == null ? "#9CA3AF" : aiAvgDev < 0.5 ? "#059669" : aiAvgDev < 1.0 ? "#D97706" : "#DC2626" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "16px" }}>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── AIPrediction 최근 예측 테이블 ── */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 14 }}>최근 AI 예측 내역 (최근 20건)</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                {["예측일", "발주처", "예산", "예측사정율", "실제사정율", "편차", "결과"].map((h) => (
                  <th key={h} style={{ padding: "9px 12px", textAlign: "left", color: "#374151", fontWeight: 600, borderBottom: "2px solid #E8ECF2", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(recentPreds ?? []).map((p: any, i: number) => {
                const hasResult = p.resultFilledAt != null;
                const hitColor  = p.isExact ? "#059669" : p.isHit ? "#1B3A6B" : p.isNearHit ? "#D97706" : hasResult ? "#DC2626" : "#9CA3AF";
                const hitLabel  = p.isExact ? "완전 적중" : p.isHit ? "적중" : p.isNearHit ? "근접" : hasResult ? "미적중" : "미개찰";
                return (
                  <tr key={i} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "8px 12px", color: "#6B7280", whiteSpace: "nowrap" }}>
                      {new Date(p.predictedAt).toLocaleDateString("ko-KR")}
                    </td>
                    <td style={{ padding: "8px 12px", color: "#374151", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={p.orgName}>
                      {p.orgName}
                    </td>
                    <td style={{ padding: "8px 12px", color: "#374151", whiteSpace: "nowrap" }}>
                      {Number(p.budget ?? 0).toLocaleString("ko-KR")}원
                    </td>
                    <td style={{ padding: "8px 12px", color: "#1B3A6B", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {Number(p.predictedSajungRate).toFixed(2)}%
                    </td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      {hasResult
                        ? <span style={{ color: "#374151", fontWeight: 600 }}>{Number(p.actualSajungRate).toFixed(2)}%</span>
                        : <span style={{ color: "#D1D5DB" }}>미개찰</span>}
                    </td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      {hasResult
                        ? <span style={{ color: Number(p.deviationPct) <= 0.5 ? "#059669" : "#DC2626" }}>{Number(p.deviationPct).toFixed(3)}%p</span>
                        : <span style={{ color: "#D1D5DB" }}>-</span>}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: hitColor, background: hitColor + "1a", padding: "2px 7px", borderRadius: 5 }}>
                        {hitLabel}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {(recentPreds ?? []).length === 0 && (
                <tr><td colSpan={7} style={{ padding: "20px 12px", color: "#9CA3AF", textAlign: "center" }}>AI 분석 데이터 없음</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SajungRateStat 신뢰도 분포 ── */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>발주처 신뢰도 분포</div>
          <span style={{ fontSize: 12, color: "#9CA3AF" }}>
            발주처 {confidenceTotal}개 / 평균 사정율 {avgSajung != null ? avgSajung.toFixed(2) + "%" : "-"}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
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
        {confidenceTotal > 0 && (
          <div style={{ height: 8, borderRadius: 4, overflow: "hidden", display: "flex" }}>
            <div style={{ width: `${(highCount / confidenceTotal) * 100}%`, background: "#059669" }} />
            <div style={{ width: `${(mediumCount / confidenceTotal) * 100}%`, background: "#D97706" }} />
            <div style={{ width: `${(lowCount / confidenceTotal) * 100}%`, background: "#DC2626" }} />
          </div>
        )}
        {totalStatRows === 0 && (
          <div style={{ color: "#9CA3AF", fontSize: 13, marginTop: 8 }}>
            SajungRateStat 데이터 없음 — collect-sajung-stat.ts 실행 필요
          </div>
        )}
      </div>

      {/* ── BidPricePrediction 백테스트 ── */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 4 }}>
          BidPricePrediction 백테스트 <span style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 400 }}>(CORE 1 엔진 · 최근 {bppTotal}건 예측)</span>
        </div>
        <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 10 }}>
          BidResult 보유 {bppCompared}건 기준 — 실제 낙찰 결과와 비교
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          {[
            { label: "비교 가능", value: bppCompared + "건", color: "#374151" },
            { label: "적중 ±0.5%", value: bppCompared > 0 ? `${bppHitRate.toFixed(1)}%` : "-", color: bppHitRate >= 30 ? "#059669" : bppHitRate >= 15 ? "#D97706" : "#DC2626" },
            { label: "근접 ±1.0%", value: bppCompared > 0 ? `${bppNearRate.toFixed(1)}%` : "-", color: bppNearRate >= 50 ? "#059669" : bppNearRate >= 30 ? "#D97706" : "#DC2626" },
            { label: "MAE (평균편차)", value: bppMAE != null ? `${bppMAE.toFixed(3)}%p` : "-", color: bppMAE == null ? "#9CA3AF" : bppMAE < 0.5 ? "#059669" : bppMAE < 1.0 ? "#D97706" : "#DC2626" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "16px" }}>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* 편차 구간 stacked bar */}
        {bppCompared > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>
              <span>편차 구간 분포</span>
              <span>
                ≤0.5% {bppZone0}건 · 0.5~1% {bppZone1}건 · 1~2% {bppZone2}건 · &gt;2% {bppZone3}건
              </span>
            </div>
            <div style={{ height: 10, borderRadius: 5, overflow: "hidden", display: "flex", background: "#F1F5F9" }}>
              {bppZone0 > 0 && <div style={{ width: `${(bppZone0 / bppCompared) * 100}%`, background: "#059669" }} />}
              {bppZone1 > 0 && <div style={{ width: `${(bppZone1 / bppCompared) * 100}%`, background: "#D97706" }} />}
              {bppZone2 > 0 && <div style={{ width: `${(bppZone2 / bppCompared) * 100}%`, background: "#DC2626" }} />}
              {bppZone3 > 0 && <div style={{ width: `${(bppZone3 / bppCompared) * 100}%`, background: "#7F1D1D" }} />}
            </div>
          </div>
        )}

        {/* 최근 20건 테이블 */}
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 14 }}>
            최근 예측 vs 실제 결과 ({bppRecent.length}건)
          </div>
          {bppCompared === 0 ? (
            <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
              BidResult 매칭 데이터 없음 — 낙찰 결과 수집 후 표시됩니다
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: "#F8FAFC" }}>
                    {["예측일", "발주처", "업종", "예측사정율", "실제사정율", "편차", "결과"].map((h) => (
                      <th key={h} style={{ padding: "9px 12px", textAlign: "left", color: "#374151", fontWeight: 600, borderBottom: "2px solid #E8ECF2", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bppRecent.map((r, i) => {
                    const hitColor = r.isHit ? "#059669" : r.isNear ? "#D97706" : "#DC2626";
                    const hitLabel = r.isHit ? "적중" : r.isNear ? "근접" : "미적중";
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #F1F5F9" }}>
                        <td style={{ padding: "8px 12px", color: "#6B7280", whiteSpace: "nowrap" }}>
                          {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                        </td>
                        <td style={{ padding: "8px 12px", color: "#374151", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.orgName}>
                          {r.orgName}
                        </td>
                        <td style={{ padding: "8px 12px", color: "#374151", whiteSpace: "nowrap" }}>{r.category}</td>
                        <td style={{ padding: "8px 12px", color: "#1B3A6B", fontWeight: 600, whiteSpace: "nowrap" }}>
                          {r.predictedSajungRate.toFixed(2)}%
                        </td>
                        <td style={{ padding: "8px 12px", fontWeight: 600, whiteSpace: "nowrap" }}>
                          {r.actualSajungRate.toFixed(2)}%
                        </td>
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                          <span style={{ color: r.deviation <= 0.5 ? "#059669" : r.deviation <= 1.0 ? "#D97706" : "#DC2626" }}>
                            {r.deviation.toFixed(3)}%p
                          </span>
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: hitColor, background: hitColor + "1a", padding: "2px 7px", borderRadius: 5 }}>
                            {hitLabel}
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
    </div>
  );
}
