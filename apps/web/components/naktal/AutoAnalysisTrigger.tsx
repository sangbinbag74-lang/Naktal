"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function AutoAnalysisTrigger({ annId, annDbId }: { annId: string; annDbId: string }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/analysis/comprehensive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annId: annDbId }),
    })
      .then((res) => {
        if (res.ok) {
          router.refresh();
        } else {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
  }, [annDbId, router]);

  if (failed) {
    return (
      <div style={{
        background: "#FFF7ED", border: "1px solid #FED7AA",
        borderRadius: 12, padding: "20px 24px", textAlign: "center",
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#92400E", marginBottom: 8 }}>
          AI 분석에 실패했습니다
        </div>
        <div style={{ fontSize: 12, color: "#B45309", marginBottom: 16 }}>
          공고 상세 페이지에서 AI 분석을 다시 시도해주세요.
        </div>
        <Link
          href={`/announcements/${annId}`}
          style={{
            display: "inline-block", padding: "8px 20px",
            background: "#1B3A6B", color: "#fff",
            borderRadius: 8, fontSize: 13, fontWeight: 700,
            textDecoration: "none",
          }}
        >
          공고 상세로 이동
        </Link>
      </div>
    );
  }

  return (
    <div style={{
      background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2",
      padding: "40px 28px", textAlign: "center",
    }}>
      <div style={{
        width: 36, height: 36, border: "3px solid #E8ECF2",
        borderTop: "3px solid #1B3A6B", borderRadius: "50%",
        margin: "0 auto 16px",
        animation: "spin 0.8s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", marginBottom: 6 }}>
        AI 분석 중...
      </div>
      <div style={{ fontSize: 12, color: "#94A3B8" }}>
        잠시만 기다려 주세요
      </div>
    </div>
  );
}
