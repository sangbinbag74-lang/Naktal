"use client";
import Link from "next/link";

export default function RealtimePage() {
  // TODO: 실제 구현은 B안 Step 2에서. 현재는 Pro 업그레이드 배너 표시.
  // Pro 여부는 실제로는 서버에서 plan 정보를 받아야 하지만, 지금은 UI만 구현
  const isPro = false; // 실제로는 layout에서 plan prop 받아서 판단

  if (!isPro) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: 0 }}>실시간 모니터</h2>
            <span style={{ fontSize: 11, fontWeight: 700, background: "#F0F9FF", color: "#0369A1", padding: "3px 8px", borderRadius: 5 }}>CORE 2</span>
            <span style={{ fontSize: 10, fontWeight: 700, background: "#059669", color: "#fff", padding: "2px 6px", borderRadius: 4 }}>PRO 전용</span>
          </div>
          <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>마감 3시간 전 실시간 참여자 수 변화를 모니터링하고 번호 전략을 실시간으로 갱신합니다.</p>
        </div>

        {/* 블러 미리보기 */}
        <div style={{ position: "relative", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ filter: "blur(4px)", pointerEvents: "none", background: "#fff", border: "1px solid #E8ECF2", borderRadius: 14, padding: "24px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
              {[["모니터링 공고", "12건"], ["현재 참여자", "평균 8.3개사"], ["마감 임박", "3건 D-1"]].map(([label, val]) => (
                <div key={label} style={{ background: "#F8FAFC", borderRadius: 10, padding: "14px" }}>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{ height: 200, background: "#F8FAFC", borderRadius: 10 }} />
          </div>
          {/* 잠금 오버레이 */}
          <div style={{ position: "absolute", inset: 0, background: "rgba(15,30,60,0.7)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, borderRadius: 14 }}>
            <span style={{ fontSize: 40 }}>🔒</span>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 6 }}>Pro 플랜 전용 기능</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 20 }}>실시간 참여자 수 예측으로 번호 전략을 최적화하세요</div>
              <Link href="/pricing" style={{ background: "#60A5FA", color: "#fff", borderRadius: 10, padding: "12px 28px", fontSize: 14, fontWeight: 700, textDecoration: "none", display: "inline-block" }}>Pro 시작하기 →</Link>
            </div>
          </div>
        </div>

        {/* 기능 설명 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {[
            { icon: "📡", title: "실시간 참여 신청 현황", desc: "나라장터 실시간 참여 데이터를 5분마다 업데이트" },
            { icon: "🔄", title: "번호 전략 자동 갱신", desc: "참여자 수 변화에 따라 추천 번호 조합 실시간 재계산" },
            { icon: "🔔", title: "마감 알림", desc: "D-3 이내 공고 참여자 급증 시 즉시 알림" },
          ].map(({ icon, title, desc }) => (
            <div key={title} style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px" }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: 0 }}>실시간 모니터</h2>
      <p style={{ color: "#64748B" }}>B안 Step 2에서 실제 크롤러 연동 예정입니다.</p>
    </div>
  );
}
