export default function Loading() {
  const skel: React.CSSProperties = {
    background: "linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%)",
    backgroundSize: "200% 100%",
    animation: "naktal-shimmer 1.4s ease-in-out infinite",
    borderRadius: 8,
  };
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20, paddingBottom: 40 }}>
      <style>{`@keyframes naktal-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>

      {/* 헤더 */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "28px 24px", textAlign: "center", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
        <div style={{ ...skel, width: 40, height: 40, borderRadius: 999 }} />
        <div style={{ ...skel, width: "60%", height: 18 }} />
        <div style={{ ...skel, width: "80%", height: 12 }} />
        <div style={{ ...skel, width: "50%", height: 11 }} />
      </div>

      {/* AI 추천 투찰금액 */}
      <div style={{ background: "linear-gradient(135deg, #1B3A6B 0%, #2563EB 100%)", borderRadius: 14, padding: "28px 24px", textAlign: "center", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
        <div style={{ background: "rgba(255,255,255,0.2)", width: "30%", height: 12, borderRadius: 4 }} />
        <div style={{ background: "rgba(255,255,255,0.4)", width: "70%", height: 36, borderRadius: 6 }} />
        <div style={{ background: "rgba(255,255,255,0.2)", width: "40%", height: 12, borderRadius: 4 }} />
      </div>

      {/* 4 카드 */}
      <div style={{ background: "#fff", borderRadius: 14, border: "2px solid #E8ECF2", padding: "20px 24px" }}>
        <div style={{ ...skel, width: "40%", height: 16, marginBottom: 16 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ background: "#F8FAFC", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ ...skel, width: "50%", height: 11 }} />
              <div style={{ ...skel, width: "70%", height: 18 }} />
              <div style={{ ...skel, width: "60%", height: 10 }} />
            </div>
          ))}
        </div>
      </div>

      {/* 번호 조합 */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px 24px", height: 220 }}>
        <div style={{ ...skel, width: "30%", height: 16, marginBottom: 16 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ ...skel, width: "100%", height: 32 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
