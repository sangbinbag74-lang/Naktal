export default function Loading() {
  const skel: React.CSSProperties = {
    background: "linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%)",
    backgroundSize: "200% 100%",
    animation: "naktal-shimmer 1.4s ease-in-out infinite",
    borderRadius: 8,
  };
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20, paddingBottom: 40 }}>
      <style>{`@keyframes naktal-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>

      {/* 헤더 */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ ...skel, width: "70%", height: 22 }} />
        <div style={{ ...skel, width: "50%", height: 13 }} />
      </div>

      {/* 계약 본문 (갑·을 카드) */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "24px 28px" }}>
        <div style={{ ...skel, width: "30%", height: 18, marginBottom: 16 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[0, 1].map((i) => (
            <div key={i} style={{ background: "#F8FAFC", borderRadius: 10, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ ...skel, width: "40%", height: 12 }} />
              <div style={{ ...skel, width: "70%", height: 16 }} />
              <div style={{ ...skel, width: "60%", height: 13 }} />
              <div style={{ ...skel, width: "50%", height: 13 }} />
            </div>
          ))}
        </div>
      </div>

      {/* 추천 투찰가 카드 */}
      <div style={{ background: "linear-gradient(135deg, #1B3A6B 0%, #2563EB 100%)", borderRadius: 14, padding: "28px 24px", textAlign: "center", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
        <div style={{ background: "rgba(255,255,255,0.2)", width: "30%", height: 12, borderRadius: 4 }} />
        <div style={{ background: "rgba(255,255,255,0.4)", width: "60%", height: 36, borderRadius: 6 }} />
      </div>

      {/* 전자서명 폼 */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ ...skel, width: "30%", height: 16 }} />
        <div style={{ ...skel, width: "100%", height: 48 }} />
        <div style={{ ...skel, width: "100%", height: 48 }} />
        <div style={{ ...skel, width: "100%", height: 50, marginTop: 6 }} />
      </div>
    </div>
  );
}
