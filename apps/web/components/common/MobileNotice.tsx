"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "naktal_mobile_dismissed";

export function MobileNotice() {
  const [isMobile, setIsMobile] = useState(false);
  const [dismissed, setDismissed] = useState(true); // 초기엔 가린 채

  useEffect(() => {
    // 세션당 1회만 표시 (sessionStorage)
    const wasDismissed = sessionStorage.getItem(STORAGE_KEY) === "1";
    setDismissed(wasDismissed);

    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  function handleDismiss() {
    sessionStorage.setItem(STORAGE_KEY, "1");
    setDismissed(true);
  }

  if (!isMobile || dismissed) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(15,30,60,0.97)",
      backdropFilter: "blur(8px)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "32px 24px", textAlign: "center",
      animation: "fadeIn 0.2s ease",
    }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
      `}</style>

      {/* 로고 */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
        <span style={{
          width: 40, height: 40, borderRadius: 9,
          background: "#1B3A6B", color: "#fff",
          display: "grid", placeItems: "center",
          fontWeight: 900, fontSize: 21, letterSpacing: "-0.04em",
        }}>낙</span>
        <span style={{ display: "inline-flex", alignItems: "baseline" }}>
          <span style={{ fontSize: 26, fontWeight: 800, color: "#fff", letterSpacing: "-0.025em" }}>NAKTAL</span>
          <span style={{ fontSize: 26, fontWeight: 800, color: "#60A5FA" }}>.AI</span>
        </span>
      </div>

      {/* 아이콘 */}
      <div style={{ fontSize: 60, marginBottom: 20, opacity: 0.9 }}>🖥️</div>

      <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 14, letterSpacing: "-0.02em", lineHeight: 1.35 }}>
        PC 환경에서<br />접속해 주세요
      </div>

      <div style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 1.7, maxWidth: 320, marginBottom: 28 }}>
        Naktal.ai 는 공공입찰 분석에 특화된 서비스로<br />
        <strong style={{ color: "#fff" }}>PC 환경</strong> 에서 가장 정확하게 작동합니다.
      </div>

      {/* 가이드 카드 */}
      <div style={{
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: 12,
        padding: "16px 20px",
        maxWidth: 340,
        width: "100%",
        marginBottom: 28,
      }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 600, marginBottom: 8 }}>
          접속 방법
        </div>
        <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.92)", lineHeight: 1.7, textAlign: "left" }}>
          PC 브라우저에서<br />
          <span style={{ color: "#60A5FA", fontWeight: 700 }}>naktal.me</span> 로 접속해 주세요
        </div>
      </div>

      <button
        onClick={handleDismiss}
        style={{
          fontSize: 12, padding: "10px 20px",
          background: "transparent",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 8,
          color: "rgba(255,255,255,0.65)",
          cursor: "pointer",
          fontWeight: 500,
        }}
      >
        그래도 모바일로 계속 보기
      </button>

      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 24, lineHeight: 1.5 }}>
        ※ 모바일에서는 일부 분석 기능이<br />정상 작동하지 않을 수 있습니다
      </div>
    </div>
  );
}
