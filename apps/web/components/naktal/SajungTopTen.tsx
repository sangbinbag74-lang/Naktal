"use client";

import { useEffect, useState } from "react";
import type { SajungTopTenResponse } from "@/app/api/analysis/sajung-topten/route";
import { formatDeviation, formatSajung, deviationColor } from "@/lib/format";

interface SajungTopTenProps {
  annId: string;
  predictedSajungRate?: number;
  budget: number;
  period?: string;
  categoryFilter?: "same" | "all";
  orgScope?: "exact" | "expand";
  onLoad?: (sampleSize: number, fromCache: boolean) => void;
}

function fmt(n: number): string {
  if (n >= 100_000_000) {
    const uk = Math.floor(n / 100_000_000);
    const man = Math.floor((n % 100_000_000) / 10_000);
    return man > 0 ? `${uk}억 ${man.toLocaleString()}만원` : `${uk}억원`;
  }
  if (n >= 10_000) return `${Math.floor(n / 10_000).toLocaleString()}만원`;
  return `${n.toLocaleString()}원`;
}

export function SajungTopTen({ annId, predictedSajungRate, budget: _budget, period = "3y", categoryFilter = "same", orgScope = "exact", onLoad }: SajungTopTenProps) {
  const [data, setData] = useState<SajungTopTenResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!annId) return;
    setLoading(true);
    const qs = new URLSearchParams({ annId, period, categoryFilter, orgScope });
    fetch(`/api/analysis/sajung-topten?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        const resp = d as SajungTopTenResponse;
        setData(resp);
        onLoad?.(resp.sampleSize, resp.fromCache ?? false);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [annId, period, categoryFilter, orgScope]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div style={{ padding: "24px 0", textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
        낙찰 확률 구간을 분석하는 중...
      </div>
    );
  }

  if (!data || data.sampleSize === 0) {
    return (
      <div style={{ padding: "20px", background: "#F8FAFC", borderRadius: 10, textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "#94A3B8" }}>분석 데이터가 부족합니다.</div>
        <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4 }}>적중분석1의 분포 히스토그램을 참고하세요.</div>
      </div>
    );
  }

  if (data.sampleSize < 10) {
    return (
      <div style={{ padding: "12px 14px", background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, fontSize: 12, color: "#92400E" }}>
        ⚠️ 데이터가 {data.sampleSize}건으로 부족합니다. 적중분석1의 히스토그램을 우선 참고하세요.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 자동 expand 안내 배너 */}
      {data.autoExpanded && (
        <div style={{ padding: "8px 12px", background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 8, fontSize: 12, color: "#9A3412" }}>
          📡 동일 발주처 데이터가 부족해 유사 기관명까지 확장 검색했습니다.
        </div>
      )}

      {/* 헤더 정보 */}
      <div style={{ fontSize: 12, color: "#64748B" }}>
        {data.sampleSize.toLocaleString()}건 낙찰 결과 기반 · 낙찰하한율 {data.lowerLimitRate.toFixed(3)}%
      </div>

      {/* TOP 10 테이블 */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #E8ECF2" }}>
              <th style={{ padding: "8px 10px", textAlign: "center", color: "#94A3B8", fontWeight: 600, fontSize: 11 }}>순위</th>
              <th style={{ padding: "8px 10px", textAlign: "center", color: "#94A3B8", fontWeight: 600, fontSize: 11 }}>사정율 구간</th>
              <th style={{ padding: "8px 10px", textAlign: "center", color: "#94A3B8", fontWeight: 600, fontSize: 11 }}>낙찰 빈도</th>
              <th style={{ padding: "8px 10px", textAlign: "left", color: "#94A3B8", fontWeight: 600, fontSize: 11, minWidth: 80 }}>매력도</th>
              <th style={{ padding: "8px 10px", textAlign: "right", color: "#94A3B8", fontWeight: 600, fontSize: 11 }}>참고 투찰가 ¹</th>
            </tr>
          </thead>
          <tbody>
            {data.topTen.map((item) => {
              const isAiMatch = predictedSajungRate != null
                && Math.abs(item.bucket - predictedSajungRate) <= 0.15;
              const isFirst = item.rank === 1;
              return (
                <tr
                  key={item.bucket}
                  style={{
                    borderBottom: "1px solid #F1F5F9",
                    background: isFirst ? "#EFF6FF" : isAiMatch ? "#F5F3FF" : "transparent",
                  }}
                >
                  {/* 순위 */}
                  <td style={{ padding: "10px", textAlign: "center" }}>
                    <span style={{
                      display: "inline-block",
                      width: 24, height: 24, lineHeight: "24px",
                      borderRadius: "50%",
                      background: isFirst ? "#1B3A6B" : "#E2E8F0",
                      color: isFirst ? "#fff" : "#64748B",
                      fontSize: 12, fontWeight: 700, textAlign: "center",
                    }}>
                      {item.rank}
                    </span>
                  </td>
                  {/* 사정율 구간 */}
                  <td style={{ padding: "10px", textAlign: "center" }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#0F172A" }}>{formatSajung(item.bucket)}</div>
                    <div style={{ fontSize: 11, color: deviationColor(item.bucket), marginTop: 2 }}>
                      {formatDeviation(item.bucket)}
                    </div>
                    {isAiMatch && (
                      <div style={{ fontSize: 10, fontWeight: 600, color: "#5B21B6", background: "#EDE9FE", borderRadius: 4, padding: "1px 6px", marginTop: 3, display: "inline-block" }}>
                        AI 추천
                      </div>
                    )}
                  </td>
                  {/* 낙찰 빈도 */}
                  <td style={{ padding: "10px", textAlign: "center" }}>
                    <span style={{ fontWeight: 600, color: "#1B3A6B" }}>{item.winRate.toFixed(1)}%</span>
                    <span style={{ fontSize: 11, color: "#94A3B8", marginLeft: 4 }}>({item.winCount}건)</span>
                  </td>
                  {/* 매력도 바 */}
                  <td style={{ padding: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ flex: 1, height: 8, background: "#E2E8F0", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{
                          height: "100%",
                          width: `${item.attractiveness}%`,
                          background: isFirst ? "#1B3A6B" : "#60A5FA",
                          borderRadius: 4,
                        }} />
                      </div>
                      <span style={{ fontSize: 11, color: "#64748B", minWidth: 28, textAlign: "right" }}>
                        {item.attractiveness}
                      </span>
                    </div>
                  </td>
                  {/* 참고 투찰가 */}
                  <td style={{ padding: "10px", textAlign: "right", fontWeight: 600, color: "#0F172A" }}>
                    {fmt(item.bidPrice)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 면책 고지 */}
      <div style={{ fontSize: 11, color: "#94A3B8", lineHeight: 1.6 }}>
        ¹ 참고 투찰가 = 기초금액 × 사정율 구간 × 낙찰하한율. 통계적 참고 자료이며 낙찰을 보장하지 않습니다.
      </div>
    </div>
  );
}
