"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ComprehensiveResult } from "./AnnouncementTabs";

interface AiAnalysisPanelProps {
  annDbId: string;
  budget: number;
  g2bUrl: string;
  onRefresh?: () => void;
}

// ── 숫자 포맷 ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.round(n)) + "원";
}

// ── 사정율 분포 바 ────────────────────────────────────────────────────────────

function SajungDistBar({ range, predicted }: {
  range: { min: number; max: number; p25: number; p75: number } | null | undefined;
  predicted: number | null | undefined;
}) {
  const min = range?.min ?? 97;
  const max = range?.max ?? 112;
  const p25 = range?.p25 ?? 101;
  const p75 = range?.p75 ?? 106;
  const pred = predicted ?? 103.8;
  const span = max - min || 6;
  const toX = (v: number) => Math.max(0, Math.min(100, ((v - min) / span) * 100));
  return (
    <div>
      <div style={{ position: "relative", height: 36, marginBottom: 6 }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 12, height: 12, background: "#E8ECF2", borderRadius: 6 }} />
        <div style={{
          position: "absolute",
          left: `${toX(p25)}%`, width: `${Math.max(0, toX(p75) - toX(p25))}%`,
          top: 12, height: 12, background: "#BFDBFE", borderRadius: 4,
        }} />
        <div style={{
          position: "absolute",
          left: `${toX(pred)}%`, transform: "translateX(-50%)",
          top: 8, width: 4, height: 20, background: "#1B3A6B", borderRadius: 2,
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94A3B8" }}>
        <span>{min.toFixed(1)}%</span>
        <span style={{ color: "#1B3A6B", fontWeight: 700 }}>예측 {pred.toFixed(2)}%</span>
        <span>{max.toFixed(1)}%</span>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export function AiAnalysisPanel({ annDbId, budget, g2bUrl, onRefresh }: AiAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<ComprehensiveResult | null>(null);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  const cacheKey = (uid: string) => `analysis_v2_${uid}_${annDbId}`;

  const fetchAnalysis = useCallback(async (forceRefresh = false) => {
    if (!userIdRef.current) {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      userIdRef.current = user?.id ?? "anon";
    }
    const uid = userIdRef.current;

    if (!forceRefresh && typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(cacheKey(uid));
        if (raw) {
          setAnalysis(JSON.parse(raw) as ComprehensiveResult);
          setLoading(false);
          return;
        }
      } catch { /* 무시 */ }
    }

    setLoading(true);
    try {
      const res = await fetch("/api/analysis/comprehensive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annId: annDbId }),
      });
      if (res.ok) {
        const data = (await res.json()) as ComprehensiveResult;
        setAnalysis(data);
        try { localStorage.setItem(cacheKey(uid), JSON.stringify(data)); } catch { /* 무시 */ }
      }
    } catch { /* 무시 */ }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annDbId]);

  useEffect(() => { void fetchAnalysis(); }, [fetchAnalysis]);

  const handleRefresh = async () => {
    if (userIdRef.current && typeof window !== "undefined") {
      try { localStorage.removeItem(cacheKey(userIdRef.current)); } catch { /* 무시 */ }
    }
    await fetchAnalysis(true);
    onRefresh?.();
  };

  const bs = analysis?.bidStrategy;
  const comp = analysis?.competition;
  const cl = bs
    ? (bs.confidenceLevel ?? (bs.isFallback ? "LOW" : bs.sampleSize >= 30 ? "HIGH" : bs.sampleSize >= 10 ? "MEDIUM" : "LOW"))
    : null;

  return (
    <div style={{ background: "#fff", border: "1px solid #E8ECF2", borderRadius: 14, overflow: "hidden" }}>
      {/* 헤더 */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px",
        borderBottom: "1px solid #F1F5F9",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 4, height: 18, background: "#1B3A6B", borderRadius: 2 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>AI 분석</span>
          {cl && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
              background: cl === "HIGH" ? "#DCFCE7" : cl === "MEDIUM" ? "#FEF3C7" : "#FEE2E2",
              color: cl === "HIGH" ? "#16A34A" : cl === "MEDIUM" ? "#D97706" : "#DC2626",
            }}>
              {cl === "HIGH" ? "높음" : cl === "MEDIUM" ? "보통" : "낮음"}
            </span>
          )}
        </div>
        <button
          onClick={() => void handleRefresh()}
          style={{
            background: "transparent", border: "1px solid #E2E8F0",
            color: "#64748B", borderRadius: 7, padding: "5px 10px", fontSize: 11, cursor: "pointer",
          }}
        >
          ↻ 재분석
        </button>
      </div>

      <div style={{ padding: "16px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#94A3B8", fontSize: 13 }}>
            AI 분석 중...
            <div style={{ fontSize: 11, marginTop: 6 }}>
              사정율·구간 분석은 <strong style={{ color: "#059669" }}>무제한 무료</strong>
            </div>
          </div>
        ) : !bs ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#94A3B8", fontSize: 13 }}>
            분석 데이터를 불러올 수 없습니다.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* ① AI 추천 투찰가 */}
            <div style={{ textAlign: "center", padding: "16px 12px", background: "#F8FAFC", borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>AI 추천 투찰가</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: cl === "LOW" ? "#94A3B8" : "#1B3A6B", lineHeight: 1.2 }}>
                {cl === "LOW" ? "데이터 부족" : fmt(bs.optimalBidPrice)}
              </div>
              {cl !== "LOW" && (
                <div style={{ fontSize: 11, color: "#64748B", marginTop: 6 }}>
                  범위 {fmt(bs.bidPriceRangeLow)}<br />~ {fmt(bs.bidPriceRangeHigh)}
                </div>
              )}
            </div>

            {/* ② 핵심 지표 2×1 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "12px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>낙찰 확률</div>
                <div style={{
                  fontSize: 18, fontWeight: 800,
                  color: cl === "LOW" ? "#94A3B8" : bs.winProbability >= 0.6 ? "#16A34A" : bs.winProbability >= 0.35 ? "#D97706" : "#DC2626",
                }}>
                  {cl === "LOW" ? "-" : `${Math.round(bs.winProbability * 100)}%`}
                </div>
                <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{bs.sampleSize}건 기반</div>
              </div>
              <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "12px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>경쟁 강도</div>
                <div style={{
                  fontSize: 18, fontWeight: 800,
                  color: comp
                    ? (comp.competitionScore >= 75 ? "#DC2626" : comp.competitionScore >= 50 ? "#D97706" : "#64748B")
                    : "#94A3B8",
                }}>
                  {comp ? `${comp.competitionScore}점` : "-"}
                </div>
                <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>
                  {comp ? `예상 ${comp.expectedBidders ?? "?"}개사` : ""}
                </div>
              </div>
            </div>

            {/* ③ 사정율 예측 슬라이더 */}
            <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                사정율 예측
                <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 400, marginLeft: 6 }}>
                  (예정가 ÷ 기초금액 × 100)
                </span>
              </div>
              <SajungDistBar range={bs.sajungRateRange} predicted={bs.predictedSajungRate} />
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 8 }}>
                예상 예정가 <strong>{fmt(budget * (bs.predictedSajungRate / 100))}</strong>
              </div>
            </div>

            {/* ③-b 추세 분석 */}
            {bs.trend && (
              <div style={{
                background: "#F8FAFC", borderRadius: 10, padding: "10px 14px",
                display: "flex", alignItems: "flex-start", gap: 10,
              }}>
                <span style={{ fontSize: 18 }}>
                  {bs.trend.direction === "up" ? "📈" : bs.trend.direction === "down" ? "📉" : "➡️"}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600,
                    color: bs.trend.direction === "up" ? "#059669" : bs.trend.direction === "down" ? "#DC2626" : "#64748B" }}>
                    {bs.trend.direction === "up" ? "상승 추세" : bs.trend.direction === "down" ? "하락 추세" : "안정 추세"}
                    {bs.trend.adjustment !== 0 && (
                      <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7, fontWeight: 400 }}>
                        ({bs.trend.adjustment >= 0 ? "+" : ""}{bs.trend.adjustment.toFixed(2)}% 반영)
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "#94A3B8" }}>
                    {bs.trend.description}
                  </div>
                </div>
                {bs.simpleAvg != null && bs.weightedAvg != null && Math.abs(bs.weightedAvg - bs.simpleAvg) >= 0.05 && (
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 10, color: "#94A3B8" }}>단순평균</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", textDecoration: "line-through" }}>
                      {bs.simpleAvg.toFixed(3)}%
                    </div>
                    <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>가중평균</div>
                    <div style={{ fontSize: 11, color: "#1B3A6B", fontWeight: 600 }}>
                      {bs.weightedAvg.toFixed(3)}%
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ④ 신뢰도 배지 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: "#64748B" }}>분석 신뢰도</span>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                background: cl === "HIGH" ? "#DCFCE7" : cl === "MEDIUM" ? "#FEF3C7" : "#FEE2E2",
                color: cl === "HIGH" ? "#16A34A" : cl === "MEDIUM" ? "#D97706" : "#DC2626",
              }}>
                {cl === "HIGH" ? "높음" : cl === "MEDIUM" ? "보통" : "낮음"} · {bs.sampleSize}건
              </span>
            </div>

            {/* ⑤ 낙찰하한가 */}
            <div style={{
              background: "#FEF2F2", borderRadius: 8, padding: "10px 12px",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 12, color: "#DC2626", flexShrink: 0 }}>⚠ 낙찰하한가</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#DC2626" }}>{fmt(bs.lowerLimitPrice)}</span>
              <span style={{ fontSize: 11, color: "#94A3B8", marginLeft: "auto", flexShrink: 0 }}>이상 필수</span>
            </div>

            {/* ⑥ 나라장터 투찰하기 */}
            <a
              href={g2bUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block", textAlign: "center",
                background: "#1B3A6B", color: "#fff",
                borderRadius: 10, padding: "13px",
                fontSize: 14, fontWeight: 700,
                textDecoration: "none",
              }}
            >
              나라장터 투찰하기 ↗
            </a>

            {/* ⑦ 면책 고지 */}
            <div style={{ fontSize: 10, color: "#94A3B8", lineHeight: 1.6 }}>
              ⚠ AI 분석 결과는 통계적 참고 자료입니다. 낙찰을 보장하지 않습니다.
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
