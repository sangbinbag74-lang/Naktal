"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { NumberAnalysisSection } from "./NumberAnalysisSection";
import { WinProbCalculator } from "./WinProbCalculator";
import { SajungHistogram } from "./SajungHistogram";
import { createClient } from "@/lib/supabase/client";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface VisitedAnn {
  annDbId: string;
  annId: string;
  title: string;
  orgName: string;
  budget: number;
  deadline: string;
  category: string;
  region: string;
  isClosed: boolean;
  multiplePrice: boolean;
  visitedAt: string | number;
  optimalBidPrice?: number | null;
  predictedSajungRate?: number | null;
  sampleSize?: number | null;
}

interface ComprehensiveResult {
  bidStrategy: {
    predictedSajungRate: number;
    sajungRateRange: { min: number; max: number; p25: number; p75: number };
    sampleSize: number;
    optimalBidPrice: number;
    bidPriceRangeLow: number;
    bidPriceRangeHigh: number;
    lowerLimitPrice: number;
    winProbability: number;
    numberStrategy: unknown;
    confidenceLevel?: "HIGH" | "MEDIUM" | "LOW";
    isFallback?: boolean;
  };
  competition: {
    competitionScore: number;
    expectedBidders: number | null;
    dominantCompany: string | null;
    dominantWinRate: number | null;
  };
  meta: {
    isFallback: boolean;
    disclaimer: string;
    sampleSize?: number;
  };
}

export interface AnnouncementTabsProps {
  annId: string;
  annDbId: string;
  title: string;
  orgName: string;
  budget: number;
  deadline: string;
  category: string;
  region: string;
  lowerLimitRate: number;    // %
  multiplePrice: boolean;
  isClosed: boolean;
  bidMethod: string;
}

// ─── 숫자 포맷 ───────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.round(n)) + "원";
}

// ─── 사정율 분포 바 ──────────────────────────────────────────────────────────

function SajungDistBar({ range, predicted }: {
  range: { min: number; max: number; p25: number; p75: number };
  predicted: number;
}) {
  const span = range.max - range.min || 6;
  const toX = (v: number) => Math.max(0, Math.min(100, ((v - range.min) / span) * 100));

  return (
    <div style={{ padding: "12px 0" }}>
      <div style={{ position: "relative", height: 36, marginBottom: 8 }}>
        {/* 전체 범위 */}
        <div style={{
          position: "absolute", left: 0, right: 0, top: 12, height: 12,
          background: "#E8ECF2", borderRadius: 6,
        }} />
        {/* IQR 구간 (p25~p75) */}
        <div style={{
          position: "absolute",
          left: `${toX(range.p25)}%`, width: `${toX(range.p75) - toX(range.p25)}%`,
          top: 12, height: 12, background: "#BFDBFE", borderRadius: 4,
        }} />
        {/* 예측값 마커 */}
        <div style={{
          position: "absolute",
          left: `${toX(predicted)}%`, transform: "translateX(-50%)",
          top: 8, width: 4, height: 20, background: "#1B3A6B", borderRadius: 2,
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94A3B8" }}>
        <span>{range.min.toFixed(1)}%</span>
        <span style={{ color: "#1B3A6B", fontWeight: 700 }}>예측 {predicted.toFixed(2)}%</span>
        <span>{range.max.toFixed(1)}%</span>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export function AnnouncementTabs({
  annId, annDbId, title, orgName, budget, deadline, category, region,
  lowerLimitRate, multiplePrice, isClosed, bidMethod,
}: AnnouncementTabsProps) {
  const [analysis, setAnalysis] = useState<ComprehensiveResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  // ─── 분석 결과 로컬 캐시 (영구, 사용자별 분리) ───────────────────────────
  function cacheKey(userId: string, id: string) { return `analysis_v2_${userId}_${id}`; }
  function loadCachedAnalysis(userId: string, id: string): ComprehensiveResult | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(cacheKey(userId, id));
      if (!raw) return null;
      return JSON.parse(raw) as ComprehensiveResult;
    } catch { return null; }
  }
  function saveCachedAnalysis(userId: string, id: string, data: ComprehensiveResult): void {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(cacheKey(userId, id), JSON.stringify(data)); } catch { /* 무시 */ }
  }

  // ─── 방문 이력 서버 저장 ────────────────────────────────────────────────────
  function saveVisitToServer(analysisData?: ComprehensiveResult): void {
    void fetch("/api/history/visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        annDbId, annId, title, orgName, budget, deadline, category, region, isClosed, multiplePrice,
        optimalBidPrice: analysisData?.bidStrategy?.optimalBidPrice ?? null,
        predictedSajungRate: analysisData?.bidStrategy?.predictedSajungRate ?? null,
        sampleSize: analysisData?.bidStrategy?.sampleSize ?? null,
      }),
    });
  }

  // 통합 분석 API 호출 (마운트 시 1회 — 사용자별 로컬 캐시 우선, 영구 보존)
  const fetchAnalysis = useCallback(async () => {
    if (!userIdRef.current) {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      userIdRef.current = user?.id ?? "anon";
    }
    const uid = userIdRef.current;

    const cached = loadCachedAnalysis(uid, annDbId);
    if (cached) {
      setAnalysis(cached);
      setAnalysisLoading(false);
      saveVisitToServer(cached);
      return;
    }

    setAnalysisLoading(true);
    try {
      const res = await fetch("/api/analysis/comprehensive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annId: annDbId }),
      });
      if (res.ok) {
        const data = (await res.json()) as ComprehensiveResult;
        setAnalysis(data);
        saveCachedAnalysis(uid, annDbId, data);
        saveVisitToServer(data);
      } else {
        saveVisitToServer();
      }
    } catch { saveVisitToServer(); }
    setAnalysisLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annDbId]);

  useEffect(() => { void fetchAnalysis(); }, [fetchAnalysis]);

  const bs = analysis?.bidStrategy;
  const comp = analysis?.competition;

  return (
    <div style={{ background: "#fff", border: "1px solid #E8ECF2", borderRadius: 12, padding: "20px 24px" }}>
      {analysisLoading ? (
        <div style={{ textAlign: "center", padding: "36px 0" }}>
          <div style={{ fontSize: 14, color: "#64748B", marginBottom: 8 }}>AI가 분석을 진행중입니다...</div>
          <div style={{ fontSize: 12, color: "#94A3B8" }}>
            사정율·구간 분석은 <strong style={{ color: "#059669" }}>무제한 무료</strong>입니다.
            <br />번호 추천만 플랜 한도가 적용됩니다.
          </div>
        </div>
      ) : !bs ? (
        <div style={{ color: "#94A3B8", textAlign: "center", padding: "40px 0" }}>분석 데이터를 불러올 수 없습니다.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* 신뢰도 경고 배너 */}
          {(() => {
            const cl = bs.confidenceLevel ?? (bs.isFallback ? "LOW" : bs.sampleSize >= 30 ? "HIGH" : bs.sampleSize >= 10 ? "MEDIUM" : "LOW");
            if (cl === "MEDIUM") return (
              <div style={{ padding: "10px 14px", background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 10, fontSize: 13, color: "#92400E" }}>
                ⚠️ 데이터가 충분하지 않아 예측 정확도가 낮을 수 있습니다. ({bs.sampleSize}건 기준)
              </div>
            );
            if (cl === "LOW") return (
              <div style={{ padding: "12px 16px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, fontSize: 13, color: "#7F1D1D" }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>⛔ 이 발주처의 분석 데이터가 부족합니다 ({bs.sampleSize}건)</div>
                업종·지역 평균 기준으로 참고용 수치를 제공합니다. 낙찰하한가 <strong>{fmt(bs.lowerLimitPrice)}</strong> 이상 투찰 필수.
              </div>
            );
            return null;
          })()}

          {/* 핵심 지표 3카드 */}
          {(() => {
            const cl = bs.confidenceLevel ?? (bs.isFallback ? "LOW" : bs.sampleSize >= 30 ? "HIGH" : bs.sampleSize >= 10 ? "MEDIUM" : "LOW");
            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {[
                  {
                    label: "AI 추천 투찰가",
                    value: cl === "LOW" ? "데이터 부족" : fmt(bs.optimalBidPrice),
                    sub: cl === "LOW" ? `${bs.sampleSize}건` : `범위: ${fmt(bs.bidPriceRangeLow)} ~ ${fmt(bs.bidPriceRangeHigh)}`,
                    color: cl === "LOW" ? "#94A3B8" : "#1B3A6B",
                  },
                  {
                    label: "구간 적중 확률",
                    value: cl === "LOW" ? "-" : `${Math.round(bs.winProbability * 100)}%`,
                    sub: bs.isFallback ? `데이터 부족 (${bs.sampleSize}건)` : `${bs.sampleSize}건 기반`,
                    color: cl === "LOW" ? "#94A3B8" : bs.winProbability >= 0.6 ? "#16A34A" : bs.winProbability >= 0.35 ? "#D97706" : "#DC2626",
                  },
                  {
                    label: "경쟁 강도",
                    value: comp ? `${comp.competitionScore}점` : "-",
                    sub: comp ? `예상 ${comp.expectedBidders ?? "?"}개사 참여` : "",
                    color: comp && comp.competitionScore >= 75 ? "#DC2626" : comp && comp.competitionScore >= 50 ? "#D97706" : "#64748B",
                  },
                ].map(c => (
                  <div key={c.label} style={{ background: "#F8FAFC", borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>{c.label}</div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: c.color }}>{c.value}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>{c.sub}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* 사정율 예측 + 분포 */}
          <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>
              사정율 예측
              <span style={{ fontSize: 12, color: "#64748B", fontWeight: 400, marginLeft: 8 }}>
                (예정가격 ÷ 기초금액 × 100)
              </span>
            </div>
            <SajungDistBar range={bs.sajungRateRange} predicted={bs.predictedSajungRate} />
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 8 }}>
              예측 사정율 <strong style={{ color: "#1B3A6B" }}>{bs.predictedSajungRate.toFixed(2)}%</strong>
              {" · "}예상 예정가 <strong>{fmt(budget * (bs.predictedSajungRate / 100))}</strong>
              {" · "}낙찰하한가 <strong style={{ color: "#DC2626" }}>{fmt(bs.lowerLimitPrice)}</strong>
            </div>
          </div>

          {/* 사정율 분포 히스토그램 */}
          <div style={{ background: "#fff", border: "1px solid #E8ECF2", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>
              사정율 분포 히스토그램
              <span style={{ fontSize: 12, color: "#64748B", fontWeight: 400, marginLeft: 8 }}>
                이 발주처의 역대 사정율 분포
              </span>
            </div>
            <SajungHistogram
              annId={annDbId}
              predictedSajungRate={bs?.predictedSajungRate}
              lowerLimitRate={lowerLimitRate}
            />
          </div>

          {/* WinProbCalculator */}
          <WinProbCalculator
            budget={budget}
            sajungMean={bs.predictedSajungRate}
            sajungStd={Math.max(0.3, (bs.sajungRateRange.p75 - bs.sajungRateRange.p25) / 1.35)}
            lowerLimitRate={lowerLimitRate}
            optimalBidPrice={bs.optimalBidPrice}
            lowerLimitPrice={bs.lowerLimitPrice}
          />

          {/* 복수예가 번호 전략 */}
          {multiplePrice && (
            <div style={{ border: "2px solid #C7D2FE", borderRadius: 12, padding: "20px 24px" }}>
              <NumberAnalysisSection
                annId={annDbId}
                isClosed={isClosed}
                bidMethod={bidMethod}
                defaultBidders={analysis?.competition?.expectedBidders ?? undefined}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
