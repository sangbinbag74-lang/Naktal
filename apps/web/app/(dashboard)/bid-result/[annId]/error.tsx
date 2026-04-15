"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function BidResultError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[bid-result] page error:", error.message, error.stack);
  }, [error]);

  return (
    <div style={{ maxWidth: 480, margin: "60px auto", textAlign: "center", padding: "0 24px" }}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>
        페이지를 불러오지 못했습니다
      </div>
      <div style={{ fontSize: 13, color: "#64748B", marginBottom: 24 }}>
        잠시 후 다시 시도해 주세요.
      </div>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <button
          onClick={reset}
          style={{
            padding: "10px 20px", background: "#1B3A6B", color: "#fff",
            borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700,
            cursor: "pointer",
          }}
        >
          다시 시도
        </button>
        <Link
          href="/announcements"
          style={{
            padding: "10px 20px", background: "#F1F5F9", color: "#374151",
            borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none",
          }}
        >
          공고 목록으로
        </Link>
      </div>
    </div>
  );
}
