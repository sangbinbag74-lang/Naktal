"use client";

import { useEffect } from "react";
import Link from "next/link";
import { reportError } from "@/lib/error-report";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { scope: "root", digest: error.digest });
  }, [error]);

  return (
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
          오류가 발생했습니다
        </div>
        <div style={{ fontSize: 13, color: "#64748B", marginBottom: 20, lineHeight: 1.6 }}>
          페이지를 불러오는 중 문제가 발생했습니다. 아래 버튼으로 다시 시도하거나 홈으로 이동하실 수 있습니다.
        </div>
        <pre style={{
          background: "#FEF2F2", borderRadius: 8, padding: "12px",
          fontSize: 11, color: "#7F1D1D", overflowX: "auto",
          marginBottom: 20, whiteSpace: "pre-wrap", wordBreak: "break-all",
        }}>
          {error.message || "(no message)"}
          {error.digest ? `\nDigest: ${error.digest}` : ""}
        </pre>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={reset}
            style={{
              flex: 1, padding: "10px", background: "#1B3A6B", color: "#fff",
              borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            다시 시도
          </button>
          <Link
            href="/"
            style={{
              flex: 1, padding: "10px", background: "#F1F5F9", color: "#374151",
              borderRadius: 8, fontSize: 13, fontWeight: 600,
              textDecoration: "none", textAlign: "center",
            }}
          >
            홈으로
          </Link>
        </div>
      </div>
    </div>
  );
}
