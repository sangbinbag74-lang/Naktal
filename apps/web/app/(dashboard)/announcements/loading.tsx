// Next.js Suspense 스트리밍 — 공고 목록 즉시 스켈레톤 표시

const pulse: React.CSSProperties = {
  background: "linear-gradient(90deg, #E8ECF2 25%, #F1F5F9 50%, #E8ECF2 75%)",
  backgroundSize: "200% 100%",
  animation: "skeleton-pulse 1.4s ease-in-out infinite",
  borderRadius: 6,
};

export default function AnnouncementsLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{`
        @keyframes skeleton-pulse {
          0% { background-position: 200% 0 }
          100% { background-position: -200% 0 }
        }
      `}</style>

      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ ...pulse, height: 24, width: 120, marginBottom: 8 }} />
          <div style={{ ...pulse, height: 14, width: 200 }} />
        </div>
        <div style={{ ...pulse, height: 36, width: 120, borderRadius: 8 }} />
      </div>

      {/* 필터바 */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "14px 16px", display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[80, 100, 120, 90, 110].map((w, i) => (
          <div key={i} style={{ ...pulse, height: 28, width: w, borderRadius: 99 }} />
        ))}
      </div>

      {/* 공고 카드 스켈레톤 5개 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "16px", overflow: "hidden" }}>
            {/* 뱃지 행 */}
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              <div style={{ ...pulse, height: 18, width: 60, borderRadius: 4 }} />
              <div style={{ ...pulse, height: 18, width: 44, borderRadius: 4 }} />
            </div>
            {/* 제목 */}
            <div style={{ ...pulse, height: 18, width: `${70 + (i % 3) * 10}%`, marginBottom: 8 }} />
            {/* 발주처 */}
            <div style={{ ...pulse, height: 13, width: "40%", marginBottom: 14 }} />
            {/* AI 분석 3칸 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
              {[0, 1, 2].map((j) => (
                <div key={j} style={{ background: "#F8FAFC", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ ...pulse, height: 10, width: "60%", marginBottom: 6 }} />
                  <div style={{ ...pulse, height: 16, width: "80%" }} />
                </div>
              ))}
            </div>
            {/* 하단 버튼 행 */}
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ ...pulse, height: 30, width: 80, borderRadius: 8 }} />
              <div style={{ ...pulse, height: 30, width: 70, borderRadius: 8 }} />
              <div style={{ ...pulse, height: 30, width: 32, borderRadius: 8, marginLeft: "auto" }} />
            </div>
          </div>
        ))}
      </div>

      {/* 로딩 중 안내 */}
      <div style={{ textAlign: "center", padding: "8px 0", fontSize: 13, color: "#94A3B8" }}>
        공고를 불러오는 중입니다...
      </div>
    </div>
  );
}
