"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global]", error);
  }, [error]);

  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: "Pretendard, -apple-system, system-ui, sans-serif" }}>
        <div style={{
          minHeight: "100vh", background: "#EEF2F7",
          display: "flex", alignItems: "center", justifyContent: "center", padding: "24px",
        }}>
          <div style={{
            background: "#fff", borderRadius: 16, border: "1px solid #E8ECF2",
            padding: "32px 40px", maxWidth: 540, width: "100%",
            boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#DC2626", marginBottom: 8 }}>
              심각한 오류가 발생했습니다
            </div>
            <div style={{ fontSize: 13, color: "#64748B", marginBottom: 20, lineHeight: 1.6 }}>
              페이지 전체 로드에 실패했습니다. 새로고침을 시도하거나 잠시 후 다시 방문해 주세요.
            </div>
            <pre style={{
              background: "#FEF2F2", borderRadius: 8, padding: "12px",
              fontSize: 11, color: "#7F1D1D", overflowX: "auto",
              marginBottom: 20, whiteSpace: "pre-wrap", wordBreak: "break-all",
            }}>
              {error.message || "(no message)"}
              {error.digest ? `\nDigest: ${error.digest}` : ""}
            </pre>
            <button
              onClick={reset}
              style={{
                width: "100%", padding: "12px", background: "#1B3A6B", color: "#fff",
                borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              다시 시도
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
