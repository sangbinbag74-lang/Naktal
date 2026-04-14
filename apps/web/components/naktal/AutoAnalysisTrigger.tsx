"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

const STEPS = [
  "과거 낙찰 데이터 수집 중...",
  "사정율 통계 분석 중...",
  "몬테카를로 시뮬레이션 실행 중...",
  "최적 투찰가 계산 중...",
  "분석 완료 중...",
];

export function AutoAnalysisTrigger({ annId, annDbId }: { annId: string; annDbId: string }) {
  const [failed, setFailed] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const interval = setInterval(() => {
      setStepIdx((i) => (i < STEPS.length - 1 ? i + 1 : i));
    }, 900);

    fetch("/api/analysis/comprehensive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annId: annDbId }),
    })
      .then(async (res) => {
        clearInterval(interval);
        if (res.ok) {
          const data = await res.json().catch(() => null);
          const price = Number(data?.bidStrategy?.optimalBidPrice ?? 0);
          if (price > 0) {
            window.location.reload();
          } else {
            // 분석은 성공했지만 데이터 부족으로 optimalBidPrice=0
            setFailed(true);
          }
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        clearInterval(interval);
        setFailed(true);
      });

    return () => clearInterval(interval);
  }, [annDbId]);

  if (failed) {
    return (
      <div style={{
        minHeight: "60vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 16, textAlign: "center",
      }}>
        <div style={{ fontSize: 40 }}>⚠️</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>AI 분석에 실패했습니다</div>
        <div style={{ fontSize: 13, color: "#64748B" }}>잠시 후 다시 시도하거나 공고 상세로 돌아가세요.</div>
        <Link
          href={`/announcements/${annId}`}
          style={{
            marginTop: 8, padding: "12px 28px",
            background: "#1B3A6B", color: "#fff",
            borderRadius: 10, fontSize: 14, fontWeight: 700,
            textDecoration: "none",
          }}
        >
          ← 공고 상세로
        </Link>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "60vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 24, textAlign: "center",
    }}>
      {/* 스피너 */}
      <div style={{ position: "relative", width: 72, height: 72 }}>
        <div style={{
          position: "absolute", inset: 0,
          border: "5px solid #E8ECF2",
          borderTop: "5px solid #1B3A6B",
          borderRadius: "50%",
          animation: "spin 0.9s linear infinite",
        }} />
        <div style={{
          position: "absolute", inset: 12,
          border: "3px solid #E8ECF2",
          borderTop: "3px solid #60A5FA",
          borderRadius: "50%",
          animation: "spin 1.4s linear infinite reverse",
        }} />
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>
          AI 분석 중
        </div>
        <div style={{ fontSize: 14, color: "#1B3A6B", fontWeight: 600, marginBottom: 4 }}>
          {STEPS[stepIdx]}
        </div>
        <div style={{ fontSize: 12, color: "#94A3B8" }}>
          계약 진행을 위해 분석 결과를 준비하고 있습니다
        </div>
      </div>

      {/* 진행 바 */}
      <div style={{ width: 240, height: 4, background: "#E8ECF2", borderRadius: 99, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${((stepIdx + 1) / STEPS.length) * 100}%`,
          background: "linear-gradient(90deg, #1B3A6B, #60A5FA)",
          borderRadius: 99,
          transition: "width 0.8s ease",
        }} />
      </div>
    </div>
  );
}
