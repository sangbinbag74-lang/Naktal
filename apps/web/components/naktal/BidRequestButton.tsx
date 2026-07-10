"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Props {
  annId: string;
  konepsId: string;
  title: string;
  orgName: string;
  deadline: string;
  budget: number;
  lowerLimitRate: number;
  aValueYn: string;
  aValueTotal: number;
}

interface AnalysisData {
  bidStrategy: {
    optimalBidPrice: number;
    lowerLimitPrice: number;
    winProbability: number;
    predictedSajungRate: number;
    estimatedPrice?: number;
    sampleSize: number;
  };
  competition: {
    competitionScore: number;
    expectedBidders: number;
  };
  meta: {
    isFallback: boolean;
    bidRequestCount?: number;
  };
}

type Status = "idle" | "loading" | "error";

export function BidRequestButton({
  annId, konepsId, title, orgName, deadline,
  budget, lowerLimitRate, aValueYn, aValueTotal,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [hasRequested, setHasRequested] = useState(false);

  // 마운트 시 의뢰 여부 확인
  useEffect(() => {
    let aborted = false;
    fetch(`/api/bid-request?annId=${encodeURIComponent(annId)}`)
      .then((r) => r.json())
      .then((j) => { if (!aborted) setHasRequested(!!j.exists); })
      .catch(() => { /* 무시 */ });
    return () => { aborted = true; };
  }, [annId]);

  function handleViewContract() {
    // 수수료·전자계약 폐지 (2026-07-10) — 계약 페이지 대신 추적 결과 페이지로
    window.open(`/bid-result/${konepsId}`, "_blank", "noopener,noreferrer");
  }

  async function handleClick() {
    // 박상빈님 5/22 명시 (7번째) — 즉시 새 창 (사용자 클릭 직후 = 팝업 차단 회피)
    // 분석/저장은 백그라운드에서 진행. 새 창에서 결과 polling.
    window.open(`/bid-result/${konepsId}`, "_blank", "noopener,noreferrer");
    setHasRequested(true);

    // 백그라운드 분석 + 의뢰 저장 (사용자 대기 X)
    try {
      const analysisRes = await fetch("/api/analysis/comprehensive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annId }),
      });
      if (!analysisRes.ok) return;
      const analysis = await analysisRes.json() as AnalysisData;

      await fetch("/api/bid-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          annId,
          konepsId,
          title,
          orgName,
          deadline,
          budget,
          lowerLimitRate,
          aValueYn,
          aValueTotal,
          recommendedBidPrice: analysis.bidStrategy.optimalBidPrice,
          predictedSajungRate: analysis.bidStrategy.predictedSajungRate,
          estimatedPrice: analysis.bidStrategy.estimatedPrice ?? 0,
          lowerLimitPrice: analysis.bidStrategy.lowerLimitPrice,
          winProbability: analysis.bidStrategy.winProbability,
          competitionScore: analysis.competition.competitionScore,
        }),
      });
    } catch { /* 백그라운드 — 사용자 영향 X */ }
  }

  return (
    <>
      {/* 투찰 추적 (구 투찰 의뢰, 2026-07-10 리네이밍) — 개찰 결과 자동 추적 + 성적표 */}
      <button
        onClick={hasRequested ? handleViewContract : handleClick}
        disabled={status === "loading"}
        style={{
          fontSize: 14.5, fontWeight: 800,
          color: "#fff",
          background: status === "loading" ? "#93A8C9" : (hasRequested ? "#059669" : "#1B3A6B"),
          border: "none",
          borderRadius: 12, padding: "14px 22px",
          cursor: status === "loading" ? "not-allowed" : "pointer",
          whiteSpace: "nowrap",
          boxShadow: hasRequested ? "0 4px 14px rgba(5,150,105,0.25)" : "0 4px 14px rgba(27,58,107,0.30)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 2, lineHeight: 1.3,
        }}
      >
        <span>{status === "loading" ? "처리 중..." : (hasRequested ? "✓ 추적 중 · 결과 보기" : "📌 투찰 추적 시작")}</span>
        {!hasRequested && status !== "loading" && (
          <span style={{ fontSize: 10.5, fontWeight: 500, opacity: 0.75 }}>개찰 결과 자동 알림 · 무료</span>
        )}
      </button>

      {status === "error" && (
        <div style={{ fontSize: 11, color: "#DC2626", marginTop: 4, maxWidth: 120 }}>
          {errorMsg}
        </div>
      )}

      {status === "loading" && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{ background: "#fff", borderRadius: 12, padding: "24px 32px", fontSize: 14, color: "#374151" }}>
            의뢰 처리 중...
          </div>
        </div>
      )}
    </>
  );
}
