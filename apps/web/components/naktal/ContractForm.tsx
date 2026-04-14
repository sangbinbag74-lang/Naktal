"use client";

import { useState } from "react";
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
  optimalBidPrice: number;
  lowerLimitPrice: number;
  predictedSajungRate: number;
  estimatedPrice: number;
  winProbability: number;
  competitionScore: number;
  feeRate: number;
  feeAmount: number;
}

function fmtPrice(n: number) {
  return new Intl.NumberFormat("ko-KR").format(Math.round(n)) + "원";
}

export function ContractForm(props: Props) {
  const {
    annId, konepsId, title, orgName, deadline, budget,
    lowerLimitRate, aValueYn, aValueTotal,
    optimalBidPrice, lowerLimitPrice, predictedSajungRate,
    estimatedPrice, winProbability, competitionScore,
    feeRate, feeAmount,
  } = props;

  const router = useRouter();
  const [bizRegNo, setBizRegNo] = useState("");
  const [repName, setRepName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const bizRegNoValid = /^\d{3}-\d{2}-\d{5}$/.test(bizRegNo);
  const canSubmit = bizRegNoValid && repName.trim().length >= 2 && !loading;

  function formatBizRegNo(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setLoading(true);
    setError("");
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
          recommendedBidPrice: optimalBidPrice,
          predictedSajungRate,
          estimatedPrice,
          lowerLimitPrice,
          winProbability,
          competitionScore,
          bizRegNo,
          repName: repName.trim(),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "서명 저장에 실패했습니다.");
        setLoading(false);
        return;
      }
      router.push(`/announcements/${annId}`);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 추천 투찰금액 미리보기 */}
      <div style={{
        background: "#EEF2FF", borderRadius: 12,
        padding: "20px 24px", textAlign: "center",
      }}>
        <div style={{ fontSize: 11, color: "#6366F1", marginBottom: 4 }}>계약 체결 후 공개되는 AI 추천 투찰금액</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: "#1B3A6B", filter: "blur(7px)", userSelect: "none" }}>
          {fmtPrice(optimalBidPrice)}
        </div>
        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>
          서명 완료 후 즉시 공개됩니다
        </div>
      </div>

      {/* 수수료 안내 */}
      <div style={{
        background: "#FFFBEB", border: "1px solid #FDE68A",
        borderRadius: 10, padding: "14px 18px",
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", marginBottom: 8 }}>수수료 조건</div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: "#78350F" }}>
            낙찰 성공 시 ({(feeRate * 100).toFixed(1)}%)
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#92400E" }}>{fmtPrice(feeAmount)}</span>
        </div>
        <div style={{ fontSize: 11, color: "#B45309" }}>
          ⚠ 미낙찰 시 수수료 없음 · 완전 무료
        </div>
      </div>

      {/* 서명 입력 폼 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
            사업자등록번호
          </label>
          <input
            type="text"
            value={bizRegNo}
            onChange={(e) => setBizRegNo(formatBizRegNo(e.target.value))}
            placeholder="000-00-00000"
            style={{
              width: "100%", height: 44, padding: "0 14px",
              border: `1.5px solid ${bizRegNo && !bizRegNoValid ? "#DC2626" : "#E2E8F0"}`,
              borderRadius: 10, fontSize: 14, outline: "none",
              boxSizing: "border-box",
            }}
          />
          {bizRegNo && !bizRegNoValid && (
            <div style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>
              000-00-00000 형식으로 입력해주세요
            </div>
          )}
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
            대표자 성명
          </label>
          <input
            type="text"
            value={repName}
            onChange={(e) => setRepName(e.target.value)}
            placeholder="홍길동"
            style={{
              width: "100%", height: 44, padding: "0 14px",
              border: "1.5px solid #E2E8F0",
              borderRadius: 10, fontSize: 14, outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: "#DC2626", background: "#FEF2F2", borderRadius: 8, padding: "10px 14px" }}>
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        style={{
          height: 50, borderRadius: 12, border: "none",
          background: canSubmit ? "#1B3A6B" : "#CBD5E1",
          fontSize: 14, fontWeight: 700, color: "#fff",
          cursor: canSubmit ? "pointer" : "not-allowed",
          transition: "background 0.15s",
        }}
      >
        {loading ? "처리 중..." : "위 내용에 동의하며 전자서명합니다"}
      </button>
    </div>
  );
}
