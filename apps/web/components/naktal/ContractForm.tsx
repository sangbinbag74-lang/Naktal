"use client";

import { useEffect, useState } from "react";
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
  const [numberStrategy, setNumberStrategy] = useState<unknown>(null);
  const [snapshotAvgSajungRate, setSnapshotAvg] = useState<number | null>(null);
  const [snapshotSampleSize, setSnapshotSample] = useState<number | null>(null);
  const [snapshotConfidence, setSnapshotConf] = useState<string | null>(null);

  // 계약 시점에 AI 분석 스냅샷을 보관 → 계약 완료 시 BidRequest 에 그대로 저장 (이후 변동 차단)
  useEffect(() => {
    fetch("/api/analysis/comprehensive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annId }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        const bs = data?.bidStrategy;
        if (bs?.numberStrategy) setNumberStrategy(bs.numberStrategy);
        const avg = bs?.weightedAvg ?? bs?.simpleAvg ?? null;
        if (typeof avg === "number") setSnapshotAvg(avg);
        if (typeof bs?.sampleSize === "number") setSnapshotSample(bs.sampleSize);
        if (typeof bs?.confidenceLevel === "string") setSnapshotConf(bs.confidenceLevel);
      })
      .catch(() => null);
  }, [annId]);

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
          numberStrategy,
          snapshotAvgSajungRate,
          snapshotSampleSize,
          snapshotConfidence,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        // 서버 검증 메시지 (BIZNO_MISMATCH / NAME_MISMATCH 등) 우선 표시
        setError(json.message ?? json.error ?? "서명 저장에 실패했습니다.");
        setLoading(false);
        return;
      }
      router.push(`/bid-result/${annId}`);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
        <div style={{ padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, fontSize: 12, color: "#7F1D1D" }}>
          ⚠️ <strong>본인 사업자번호 + 대표자명만</strong> 계약 가능합니다. 가입 시 등록한 정보와 일치해야 합니다.
        </div>
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
