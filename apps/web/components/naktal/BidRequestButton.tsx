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
    // 새 탭에서 열기 — 사용자가 현재 공고 페이지를 유지할 수 있도록
    window.open(`/bid-contract/${konepsId}`, "_blank", "noopener,noreferrer");
  }

  async function handleClick() {
    // 박상빈님 5/22 명시 (7번째) — 즉시 새 창 (사용자 클릭 직후 = 팝업 차단 회피)
    // 분석/저장은 백그라운드에서 진행. 새 창에서 결과 polling.
    window.open(`/bid-contract/${konepsId}`, "_blank", "noopener,noreferrer");
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
      <button
        onClick={hasRequested ? handleViewContract : handleClick}
        disabled={status === "loading"}
        style={{
          fontSize: 12, fontWeight: 700,
          color: "#fff",
          background: status === "loading" ? "#93A8C9" : (hasRequested ? "#059669" : "#1B3A6B"),
          border: "none",
          borderRadius: 8, padding: "6px 12px",
          cursor: status === "loading" ? "not-allowed" : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {status === "loading" ? "처리 중..." : (hasRequested ? "계약서 확인 / 추천가 다시보기" : "투찰 의뢰")}
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
