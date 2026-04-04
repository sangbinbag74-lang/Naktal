export default function AlertsPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>알림 설정</h2>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>관심 공고 마감 임박·신규 공고 알림을 설정합니다.</p>
      </div>

      <div style={{
        background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2",
        padding: "64px 24px", textAlign: "center",
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔔</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>준비 중입니다</div>
        <div style={{ fontSize: 14, color: "#64748B", lineHeight: 1.7 }}>
          알림 설정 기능은 현재 개발 중입니다.<br />
          카카오 알림톡·이메일 알림으로 곧 찾아뵙겠습니다.
        </div>
      </div>
    </div>
  );
}
