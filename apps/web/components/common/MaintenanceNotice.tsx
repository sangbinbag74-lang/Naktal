/**
 * 점검 공지 배너 — 공고 목록·공고 상세 상단에 표시
 * 2026-05-15: 사정율 추천 시스템 결함(낙찰하한 미달 가능) 점검 중
 */
export function MaintenanceNotice() {
  return (
    <div style={{
      background: "linear-gradient(135deg, #FEF3C7 0%, #FED7AA 100%)",
      border: "1.5px solid #F59E0B",
      borderRadius: 10,
      padding: "12px 16px",
      marginBottom: 14,
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
    }}>
      <span style={{ fontSize: 18, lineHeight: 1.2 }}>⚠️</span>
      <div style={{ flex: 1, lineHeight: 1.5 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E", marginBottom: 3 }}>
          AI 추천 시스템 점검 중 (약 3일 예상)
        </div>
        <div style={{ fontSize: 12, color: "#7C2D12" }}>
          일부 오류가 발견되어 점검 및 재학습을 진행하고 있습니다.
          점검 기간 동안 AI 추천 결과가 정확하지 않을 수 있으니
          <strong style={{ color: "#92400E" }}> 투찰 전 반드시 직접 검토</strong>해 주시기 바랍니다.
        </div>
      </div>
    </div>
  );
}
