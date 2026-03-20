interface AiResultCardProps {
  recommendedRate?: number;
  confidenceLow?: number;
  confidenceHigh?: number;
  recommendedAmount?: number;
  avgBidRate?: number;
  disclaimer: string;
  loading?: boolean;
}

export function AiResultCard({
  recommendedRate,
  confidenceLow,
  confidenceHigh,
  recommendedAmount,
  avgBidRate,
  disclaimer,
  loading,
}: AiResultCardProps) {
  const hasData = !loading && recommendedRate != null;

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "2px solid #C7D2FE", padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>AI 분석 결과</div>
        <span style={{ fontSize: 10, fontWeight: 600, background: "#EEF2FF", color: "#1B3A6B", padding: "3px 8px", borderRadius: 4 }}>Beta</span>
      </div>

      {/* 3열 지표 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "AI 추천 투찰률", value: hasData ? `${recommendedRate?.toFixed(3)}%` : "-", color: "#1B3A6B" },
          { label: "추천 금액", value: hasData && recommendedAmount ? `${new Intl.NumberFormat("ko-KR").format(recommendedAmount)}원` : "-", color: "#0F172A" },
          { label: "발주처 낙찰률", value: hasData && avgBidRate ? `${avgBidRate.toFixed(3)}%` : "-", color: "#059669" },
        ].map((item) => (
          <div key={item.label} style={{ textAlign: "center", padding: "12px", background: "#F8FAFC", borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>{item.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: loading ? "#94A3B8" : item.color }}>
              {loading ? "..." : item.value}
            </div>
          </div>
        ))}
      </div>

      {/* 신뢰구간 바 */}
      {hasData && confidenceLow != null && confidenceHigh != null && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>
            <span>하한율 {confidenceLow.toFixed(3)}%</span>
            <span>추천 {recommendedRate?.toFixed(3)}%</span>
            <span>상한 {confidenceHigh.toFixed(3)}%</span>
          </div>
          <div style={{ height: 12, background: "#F1F5F9", borderRadius: 6, overflow: "hidden", position: "relative" }}>
            <div style={{
              position: "absolute",
              left: `${confidenceLow - 85}%`,
              width: `${confidenceHigh - confidenceLow}%`,
              height: "100%",
              background: "#C7D2FE",
            }} />
            {recommendedRate && (
              <div style={{
                position: "absolute",
                top: "50%",
                left: `${recommendedRate - 85}%`,
                transform: "translate(-50%, -50%)",
                width: 12, height: 12,
                borderRadius: "50%",
                background: "#1B3A6B",
                border: "2px solid #fff",
              }} />
            )}
          </div>
        </div>
      )}

      {/* 면책 고지 — 삭제·숨김·작은글씨 절대 금지 */}
      <div style={{
        background: "#FFF7ED",
        border: "1px solid #FDE68A",
        borderRadius: 8,
        padding: "10px 12px",
        fontSize: 12,
        color: "#92400E",
        fontWeight: 500,
      }}>
        ⚠ {disclaimer}
      </div>
    </div>
  );
}
