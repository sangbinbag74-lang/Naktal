"use client";

import { useState, useEffect } from "react";

interface NumberStrategy {
  combo1: number[];
  combo2: number[];
  combo3: number[];
  hitRate1: number;
  hitRate2: number;
  hitRate3: number;
}

interface Props {
  annDbId: string;
}

export function BidResultCombos({ annDbId }: Props) {
  const [ns, setNs] = useState<NumberStrategy | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analysis/comprehensive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annId: annDbId }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.bidStrategy?.numberStrategy) {
          setNs(data.bidStrategy.numberStrategy as NumberStrategy);
        }
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [annDbId]);

  if (loading) {
    return (
      <div style={{
        background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2",
        padding: "20px 24px", textAlign: "center", color: "#94A3B8", fontSize: 13,
      }}>
        번호 분석 중...
      </div>
    );
  }

  if (!ns) return null;

  const combos = [
    { label: "조합 1", numbers: ns.combo1, hitRate: ns.hitRate1, recommended: true },
    { label: "조합 2", numbers: ns.combo2, hitRate: ns.hitRate2, recommended: false },
    { label: "조합 3", numbers: ns.combo3, hitRate: ns.hitRate3, recommended: false },
  ];

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>AI 추천 번호 조합</div>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#1B3A6B", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 4, padding: "2px 6px" }}>
          CORE 2
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {combos.map(({ label, numbers, hitRate, recommended }) => (
          <div
            key={label}
            style={{
              border: `1.5px solid ${recommended ? "#1B3A6B" : "#E8ECF2"}`,
              borderRadius: 10,
              padding: "14px 16px",
              background: recommended ? "#F0F4FF" : "#FAFAFA",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: recommended ? "#1B3A6B" : "#64748B" }}>
                  {label}
                </span>
                {recommended && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: "#1B3A6B", borderRadius: 4, padding: "1px 5px" }}>
                    추천★
                  </span>
                )}
              </div>
              <span style={{ fontSize: 12, color: "#64748B" }}>
                낙찰 점유율 <strong style={{ color: recommended ? "#1B3A6B" : "#374151" }}>{hitRate.toFixed(1)}%</strong>
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {numbers.map((n) => (
                <div
                  key={n}
                  style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: recommended ? "#1B3A6B" : "#E8ECF2",
                    color: recommended ? "#fff" : "#374151",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 700,
                  }}
                >
                  {String(n).padStart(2, "0")}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: "#9CA3AF" }}>
        과거 낙찰 데이터 통계 기반 참고 자료이며, 낙찰을 보장하지 않습니다.
      </div>
    </div>
  );
}
