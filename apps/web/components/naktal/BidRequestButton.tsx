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
    router.push(`/bid-contract/${konepsId}`);
  }

  async function handleClick() {
    setStatus("loading");
    setErrorMsg("");
    try {
      // 1. 분석
      const analysisRes = await fetch("/api/analysis/comprehensive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annId }),
      });
      if (!analysisRes.ok) {
        const json = await analysisRes.json().catch(() => ({}));
        if (analysisRes.status === 403) {
          setErrorMsg(json.message ?? "AI 분석은 프로 플랜부터 이용할 수 있습니다.");
        } else {
          setErrorMsg("분석 데이터를 불러오지 못했습니다.");
        }
        setStatus("error");
        return;
      }
      const analysis = await analysisRes.json() as AnalysisData;

      // 2. 의뢰 저장
      const bidRes = await fetch("/api/bid-request", {
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
      if (!bidRes.ok) {
        const json = await bidRes.json().catch(() => ({}));
        setErrorMsg(json.error ?? "의뢰 저장에 실패했습니다.");
        setStatus("error");
        return;
      }

      // 3. 계약 페이지 이동
      router.push(`/bid-contract/${konepsId}`);
    } catch {
      setErrorMsg("네트워크 오류가 발생했습니다.");
      setStatus("error");
    }
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
