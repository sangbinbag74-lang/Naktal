"use client";

import { useState } from "react";

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

type Status = "idle" | "loading" | "modal" | "submitting" | "done" | "error";

function fmtPrice(n: number) {
  return new Intl.NumberFormat("ko-KR").format(Math.round(n)) + "원";
}

export function BidRequestButton({
  annId, konepsId, title, orgName, deadline,
  budget, lowerLimitRate, aValueYn, aValueTotal,
}: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const recommendedBidPrice = analysis?.bidStrategy.optimalBidPrice ?? 0;
  const feeRate = recommendedBidPrice < 100_000_000 ? 0.017 : 0.015;
  const agreedFeeAmount = Math.round(recommendedBidPrice * feeRate);

  async function handleOpen() {
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/analysis/comprehensive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        if (res.status === 403) {
          setErrorMsg(json.message ?? "AI 분석은 프로 플랜부터 이용할 수 있습니다.");
        } else {
          setErrorMsg("분석 데이터를 불러오지 못했습니다.");
        }
        setStatus("error");
        return;
      }
      const data = await res.json() as AnalysisData;
      setAnalysis(data);
      setAgreed(false);
      setStatus("modal");
    } catch {
      setErrorMsg("네트워크 오류가 발생했습니다.");
      setStatus("error");
    }
  }

  async function handleSubmit() {
    if (!analysis) return;
    setStatus("submitting");
    try {
      const res = await fetch("/api/bid-request", {
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
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErrorMsg(json.error ?? "의뢰 저장에 실패했습니다.");
        setStatus("error");
        return;
      }
      setStatus("done");
    } catch {
      setErrorMsg("네트워크 오류가 발생했습니다.");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <button
        disabled
        style={{
          fontSize: 12, fontWeight: 700,
          color: "#fff", background: "#059669",
          border: "1px solid #059669",
          borderRadius: 8, padding: "6px 12px",
          cursor: "default", whiteSpace: "nowrap",
        }}
      >
        ✓ 의뢰 완료
      </button>
    );
  }

  return (
    <>
      <button
        onClick={handleOpen}
        disabled={status === "loading"}
        style={{
          fontSize: 12, fontWeight: 700,
          color: "#fff",
          background: status === "loading" ? "#93A8C9" : "#1B3A6B",
          border: "none",
          borderRadius: 8, padding: "6px 12px",
          cursor: status === "loading" ? "not-allowed" : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {status === "loading" ? "분석 중..." : "투찰 의뢰"}
      </button>

      {status === "error" && (
        <div style={{ fontSize: 11, color: "#DC2626", marginTop: 4, maxWidth: 120 }}>
          {errorMsg}
        </div>
      )}

      {status === "modal" && analysis && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setStatus("idle"); }}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}
        >
          <div style={{
            background: "#fff", borderRadius: 16, padding: "28px 28px 24px",
            width: "100%", maxWidth: 440,
            boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
          }}>
            {/* 헤더 */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>
                투찰 의뢰 확인
              </div>
              <div style={{ fontSize: 12, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {title}
              </div>
              <div style={{ fontSize: 11, color: "#94A3B8" }}>{orgName}</div>
              <div style={{ fontSize: 11, color: "#6366F1", fontWeight: 600, marginTop: 4 }}>
                해당 공고의 {(analysis.meta.bidRequestCount ?? 0) + 1}번째 분석 의뢰
              </div>
            </div>

            {/* AI 추천 금액 */}
            <div style={{
              background: "#EEF2FF", borderRadius: 12,
              padding: "16px 20px", marginBottom: 16, textAlign: "center",
            }}>
              <div style={{ fontSize: 11, color: "#6366F1", marginBottom: 4 }}>AI 추천 투찰금액</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#1B3A6B" }}>
                {fmtPrice(recommendedBidPrice)}
              </div>
              {analysis.meta.isFallback && (
                <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4 }}>
                  ※ 데이터 부족 — 통계 추정값 ({analysis.bidStrategy.sampleSize}건)
                </div>
              )}
            </div>

            {/* 상세 수치 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              {[
                { label: "낙찰하한가", value: fmtPrice(analysis.bidStrategy.lowerLimitPrice) },
                { label: "낙찰 확률", value: `${((analysis.bidStrategy.winProbability ?? 0) * 100).toFixed(1)}%` },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: "#F8FAFC", borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#374151" }}>{value}</div>
                </div>
              ))}
            </div>

            {/* 수수료 안내 */}
            <div style={{
              background: "#FFFBEB", border: "1px solid #FDE68A",
              borderRadius: 10, padding: "12px 16px", marginBottom: 20,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#92400E", marginBottom: 6 }}>
                수수료 안내
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: "#78350F" }}>
                  요율 ({recommendedBidPrice < 100_000_000 ? "1.7%" : "1.5%"})
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#92400E" }}>
                  {fmtPrice(agreedFeeAmount)}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#B45309", lineHeight: 1.5 }}>
                ⚠ 낙찰 성공 시에만 수수료가 발생합니다.<br />
                미낙찰 시 완전 무료입니다.
              </div>
            </div>

            {/* 동의 체크박스 */}
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", marginBottom: 20 }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                style={{ marginTop: 2, width: 14, height: 14, accentColor: "#1B3A6B" }}
              />
              <span style={{ fontSize: 12, color: "#374151", lineHeight: 1.5 }}>
                AI 추천 투찰금액과 수수료 조건을 확인하였으며,
                낙찰 시 수수료 납부에 동의합니다.
              </span>
            </label>

            {/* 버튼 */}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setStatus("idle")}
                style={{
                  flex: 1, height: 44, borderRadius: 10,
                  border: "1px solid #E2E8F0", background: "#F8FAFC",
                  fontSize: 13, fontWeight: 600, color: "#64748B",
                  cursor: "pointer",
                }}
              >
                취소
              </button>
              <button
                onClick={handleSubmit}
                disabled={!agreed}
                style={{
                  flex: 2, height: 44, borderRadius: 10,
                  border: "none",
                  background: agreed ? "#1B3A6B" : "#CBD5E1",
                  fontSize: 13, fontWeight: 700, color: "#fff",
                  cursor: agreed ? "pointer" : "not-allowed",
                  transition: "background 0.15s",
                }}
              >
                의뢰하기
              </button>
            </div>
          </div>
        </div>
      )}

      {status === "submitting" && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{ background: "#fff", borderRadius: 12, padding: "24px 32px", fontSize: 14, color: "#374151" }}>
            의뢰 저장 중...
          </div>
        </div>
      )}
    </>
  );
}
