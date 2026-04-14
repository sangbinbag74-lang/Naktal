"use client";

import { useState, useEffect } from "react";
import { NumberAnalysisSection } from "./NumberAnalysisSection";

interface Props {
  annDbId: string;
}

interface NumberStrategy {
  combo1: number[];
  combo2: number[];
  combo3: number[];
  hitRate1: number;
  hitRate2: number;
  hitRate3: number;
  freqMap: Record<string, number>;
  isEstimated?: boolean;
}

interface BidStrategy {
  predictedSajungRate: number;
  sajungRateRange: { min: number; max: number; p25: number; p75: number } | null;
  sampleSize: number;
  optimalBidPrice: number;
  lowerLimitPrice: number;
  winProbability: number;
  numberStrategy: NumberStrategy | null;
  isFallback?: boolean;
  weightedAvg?: number | null;
  trend?: { direction: string; description: string } | null;
}

export function BidResultAnalysis({ annDbId }: Props) {
  const [bs, setBs] = useState<BidStrategy | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analysis/comprehensive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annId: annDbId }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.bidStrategy) setBs(data.bidStrategy as BidStrategy);
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [annDbId]);

  if (loading) {
    return (
      <div style={{
        background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2",
        padding: "24px", textAlign: "center", color: "#94A3B8", fontSize: 13,
      }}>
        분석 데이터 불러오는 중...
      </div>
    );
  }

  if (!bs) return null;

  return (
    <>
      {/* 사정율 분석 요약 */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px 24px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>사정율 분석</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            {
              label: "예측 사정율",
              value: `${Number(bs.predictedSajungRate ?? 0).toFixed(2)}%`,
            },
            bs.sajungRateRange && {
              label: "사정율 범위",
              value: `${bs.sajungRateRange.min.toFixed(1)}% ~ ${bs.sajungRateRange.max.toFixed(1)}%`,
            },
            {
              label: "분석 데이터",
              value: bs.sampleSize > 0 ? `${bs.sampleSize}건` : "기본값 (데이터 부족)",
            },
            bs.weightedAvg && {
              label: "최근 가중 평균",
              value: `${bs.weightedAvg.toFixed(2)}%`,
            },
            bs.trend && bs.trend.direction !== "stable" && {
              label: "추세",
              value: bs.trend.description,
            },
          ]
            .filter(Boolean)
            .map((row) => {
              const { label, value } = row as { label: string; value: string };
              return (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#64748B" }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{value}</span>
                </div>
              );
            })}
        </div>
        {bs.isFallback && (
          <div style={{ marginTop: 12, fontSize: 11, color: "#F59E0B", background: "#FFFBEB", borderRadius: 6, padding: "6px 10px" }}>
            ⚠ 이 발주처의 데이터가 부족해 전국 평균 기반으로 예측했습니다.
          </div>
        )}
      </div>

      {/* 번호 추천 (복수예가 공고만) */}
      {bs.numberStrategy && (
        <NumberAnalysisSection
          annId={annDbId}
          isClosed={false}
        />
      )}
    </>
  );
}
