// Next.js Suspense 스트리밍 — 공고 상세 즉시 스켈레톤 표시

const pulse: React.CSSProperties = {
  background: "linear-gradient(90deg, #E8ECF2 25%, #F1F5F9 50%, #E8ECF2 75%)",
  backgroundSize: "200% 100%",
  animation: "skeleton-pulse 1.4s ease-in-out infinite",
  borderRadius: 6,
};

export default function AnnouncementDetailLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{`
        @keyframes skeleton-pulse {
          0% { background-position: 200% 0 }
          100% { background-position: -200% 0 }
        }
      `}</style>

      {/* 헤더 카드 */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "22px 24px" }}>
        {/* 뱃지 */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <div style={{ ...pulse, height: 20, width: 70, borderRadius: 4 }} />
          <div style={{ ...pulse, height: 20, width: 50, borderRadius: 4 }} />
          <div style={{ ...pulse, height: 20, width: 80, borderRadius: 4 }} />
        </div>
        {/* 제목 */}
        <div style={{ ...pulse, height: 24, width: "85%", marginBottom: 8 }} />
        <div style={{ ...pulse, height: 24, width: "60%", marginBottom: 16 }} />
        {/* 메타 행 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ background: "#F8FAFC", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ ...pulse, height: 11, width: "50%", marginBottom: 8 }} />
              <div style={{ ...pulse, height: 20, width: "75%" }} />
            </div>
          ))}
        </div>
      </div>

      {/* D-day + 버튼 행 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ ...pulse, height: 36, width: 100, borderRadius: 8 }} />
        <div style={{ ...pulse, height: 36, width: 140, borderRadius: 8 }} />
        <div style={{ ...pulse, height: 36, width: 120, borderRadius: 8, marginLeft: "auto" }} />
      </div>

      {/* 탭 영역 */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", overflow: "hidden" }}>
        {/* 탭 헤더 */}
        <div style={{ display: "flex", borderBottom: "1px solid #E8ECF2", padding: "0 8px" }}>
          {["투찰 전략", "경쟁 분석", "참여 적합성"].map((label, i) => (
            <div key={i} style={{ padding: "14px 20px", display: "flex", alignItems: "center" }}>
              <div style={{ ...pulse, height: 14, width: label.length * 9 }} />
            </div>
          ))}
        </div>
        {/* 탭 콘텐츠 */}
        <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* 3카드 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ background: "#F8FAFC", borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
                <div style={{ ...pulse, height: 10, width: "60%", margin: "0 auto 8px" }} />
                <div style={{ ...pulse, height: 22, width: "80%", margin: "0 auto 8px" }} />
                <div style={{ ...pulse, height: 10, width: "50%", margin: "0 auto" }} />
              </div>
            ))}
          </div>
          {/* 사정율 바 */}
          <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ ...pulse, height: 14, width: 120, marginBottom: 14 }} />
            <div style={{ ...pulse, height: 12, width: "100%", marginBottom: 8 }} />
            <div style={{ ...pulse, height: 12, width: "60%" }} />
          </div>
          {/* 로딩 안내 */}
          <div style={{ textAlign: "center", padding: "8px 0", fontSize: 13, color: "#94A3B8" }}>
            AI가 분석을 준비하고 있습니다...
          </div>
        </div>
      </div>
    </div>
  );
}
