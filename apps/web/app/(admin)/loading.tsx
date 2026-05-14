// 박상빈님 명시 (2026-05-15): admin 페이지 클릭 시 로딩 시각적 피드백
// Next.js App Router 의 loading.tsx — 각 admin 페이지 전환 시 자동 표시
export default function AdminLoading() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "60vh",
      gap: 16,
      color: "#475569",
    }}>
      <div style={{
        width: 40,
        height: 40,
        border: "3px solid #E8ECF2",
        borderTopColor: "#1B3A6B",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      <div style={{ fontSize: 13, fontWeight: 500 }}>불러오는 중…</div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
