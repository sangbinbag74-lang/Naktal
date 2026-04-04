"use client";

import { useState, useCallback, useEffect } from "react";

interface WinProbCalculatorProps {
  budget: number;            // 기초금액 (원)
  sajungMean: number;        // 예측 사정율 평균 (%)
  sajungStd: number;         // 사정율 표준편차
  lowerLimitRate: number;    // 낙찰하한율 (%)
  optimalBidPrice: number;   // AI 추천 최적 투찰가 (원)
  lowerLimitPrice: number;   // 낙찰하한가 (원)
}

// ─── 결정론적 시드 기반 PRNG (Mulberry32) ────────────────────────────────────

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalRandomSeeded(rand: () => number, mean: number, std: number): number {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ─── 프론트 JS 몬테카를로 (N=5000, 시드 고정 → 동일 입력 = 동일 결과) ────────

function calcWinProb(
  myBid: number,
  budget: number,
  sajungMean: number,
  sajungStd: number,
  lowerLimitRate: number,
  n = 5000
): number {
  if (lowerLimitRate <= 0) return 0;
  // 입력값 기반 결정론적 시드 → 새로고침해도 동일한 확률
  const seed = Math.abs(Math.round(myBid / 1000) ^ Math.round(sajungMean * 100) ^ Math.round(lowerLimitRate * 10));
  const rand = mulberry32(seed || 42);
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const simSajung = normalRandomSeeded(rand, sajungMean, sajungStd);
    const simPrice  = budget * (simSajung / 100);
    const simLower  = simPrice * (lowerLimitRate / 100);
    if (myBid >= simLower && myBid <= simPrice) wins++;
  }
  return Math.round((wins / n) * 100);
}

// ─── 숫자 포맷 ───────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.round(n));
}

function parseInput(raw: string): number {
  return parseInt(raw.replace(/[^0-9]/g, ""), 10) || 0;
}

export function WinProbCalculator({
  budget,
  sajungMean,
  sajungStd,
  lowerLimitRate,
  optimalBidPrice,
  lowerLimitPrice,
}: WinProbCalculatorProps) {
  const estimatedPrice = budget * (sajungMean / 100);

  const [inputRaw, setInputRaw] = useState(fmt(optimalBidPrice));
  const [prob, setProb] = useState<number | null>(null);
  const [computing, setComputing] = useState(false);

  const myBid = parseInput(inputRaw);
  const mySajung = budget > 0 ? (myBid / budget) * 100 : 0;

  const isBelowLower = myBid > 0 && myBid < lowerLimitPrice;
  const isAboveEst   = myBid > 0 && myBid > estimatedPrice * 1.001;
  const isInRange    = myBid >= lowerLimitPrice && myBid <= estimatedPrice;

  const compute = useCallback(() => {
    if (!myBid || myBid <= 0) { setProb(null); return; }
    if (lowerLimitPrice > 0 && myBid < lowerLimitPrice) { setProb(0); return; }
    setComputing(true);
    // setTimeout으로 UI 렌더 후 계산 실행
    setTimeout(() => {
      const p = calcWinProb(myBid, budget, sajungMean, sajungStd, lowerLimitRate);
      setProb(p);
      setComputing(false);
    }, 0);
  }, [myBid, budget, sajungMean, sajungStd, lowerLimitRate, lowerLimitPrice]);

  useEffect(() => {
    const timer = setTimeout(compute, 400); // debounce
    return () => clearTimeout(timer);
  }, [compute]);

  const probColor = prob === null ? "#94A3B8"
    : prob >= 60 ? "#16A34A"
    : prob >= 35 ? "#D97706"
    : "#DC2626";

  const borderColor = isBelowLower ? "#DC2626" : isAboveEst ? "#DC2626" : isInRange ? "#16A34A" : "#E2E8F0";

  return (
    <div style={{ background: "#F8FAFC", border: "1px solid #E8ECF2", borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>
        투찰금액 시뮬레이터
      </div>

      {/* 입력 */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <input
            type="text"
            value={inputRaw}
            onChange={(e) => setInputRaw(e.target.value)}
            onBlur={() => { if (myBid) setInputRaw(fmt(myBid)); }}
            placeholder="투찰금액 입력"
            style={{
              width: "100%", boxSizing: "border-box",
              height: 44, padding: "0 48px 0 14px",
              fontSize: 15, fontWeight: 600, color: "#0F172A",
              border: `1.5px solid ${borderColor}`,
              borderRadius: 10, background: "#fff", outline: "none",
            }}
          />
          <span style={{
            position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
            fontSize: 12, color: "#94A3B8", pointerEvents: "none",
          }}>원</span>
        </div>

        <button
          onClick={() => setInputRaw(fmt(optimalBidPrice))}
          style={{
            height: 44, padding: "0 14px", whiteSpace: "nowrap",
            background: "#1B3A6B", color: "#fff", border: "none", borderRadius: 10,
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          최적가로
        </button>
      </div>

      {/* 사정율 표시 */}
      {myBid > 0 && (
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 12 }}>
          사정율 <strong style={{ color: "#1B3A6B" }}>{mySajung.toFixed(3)}%</strong>
          {" "}(예정가 기준 {sajungMean.toFixed(2)}%)
        </div>
      )}

      {/* 경고 메시지 */}
      {isBelowLower && (
        <div style={{ padding: "8px 12px", background: "#FEF2F2", borderRadius: 8, marginBottom: 12, fontSize: 12, color: "#DC2626", fontWeight: 600 }}>
          ⚠️ 낙찰하한가({fmt(lowerLimitPrice)}원) 미만 — 낙찰 불가
        </div>
      )}
      {isAboveEst && (
        <div style={{ padding: "8px 12px", background: "#FEF2F2", borderRadius: 8, marginBottom: 12, fontSize: 12, color: "#DC2626", fontWeight: 600 }}>
          ⚠️ 예정가({fmt(estimatedPrice)}원) 초과 — 낙찰 불가
        </div>
      )}
      {isInRange && !isBelowLower && !isAboveEst && (
        <div style={{ padding: "8px 12px", background: "#F0FDF4", borderRadius: 8, marginBottom: 12, fontSize: 12, color: "#16A34A", fontWeight: 600 }}>
          ✓ 유효 구간 내 투찰금액
        </div>
      )}

      {/* 유효 구간 확률 */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 2 }}>유효 구간 적중 확률</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: probColor }}>
            {computing ? "..." : prob !== null ? `${prob}%` : "—"}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ height: 8, background: "#E2E8F0", borderRadius: 4, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 4,
              width: `${prob ?? 0}%`,
              background: prob === null ? "#E2E8F0" : prob >= 60 ? "#16A34A" : prob >= 35 ? "#D97706" : "#DC2626",
              transition: "width 0.4s ease",
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94A3B8", marginTop: 3 }}>
            <span>0%</span><span>50%</span><span>100%</span>
          </div>
        </div>
      </div>

      {/* 면책 고지 */}
      <div style={{ marginTop: 14, padding: "8px 12px", background: "#FFFBEB", borderRadius: 8, fontSize: 11, color: "#92400E" }}>
        ※ 이 수치는 <strong>예정가 이하·하한가 이상</strong>인 구간에 내 금액이 들어올 통계적 확률입니다. 경쟁자 수·낙찰 방식은 반영되지 않으며, 실제 낙찰 확률과 다를 수 있습니다.
      </div>
    </div>
  );
}
