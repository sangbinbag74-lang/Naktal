"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { WinProbCalculator } from "./WinProbCalculator";
import { SajungHistogram } from "./SajungHistogram";
import { SajungTrendOverlay } from "./SajungTrendOverlay";
import { SajungTopTen } from "./SajungTopTen";
import { SajungPeriodSelector } from "./SajungPeriodSelector";
import { createClient } from "@/lib/supabase/client";
import { extractCoreOrgName } from "@/lib/analysis/sajung-utils";

type SubTab = "analysis1" | "analysis2" | "analysis3";

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

export interface ComprehensiveResult {
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
    weightedAvg?: number | null;
    simpleAvg?: number | null;
    trend?: {
      direction: "up" | "down" | "stable";
      strength: "strong" | "moderate" | "weak";
      adjustment: number;
      description: string;
    } | null;
    stabilityScore?: number | null;
    recentSampleSize?: number | null;
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

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export function AnnouncementTabs({
  annId, annDbId, title, orgName, budget, deadline, category, region,
  lowerLimitRate, multiplePrice, isClosed, bidMethod,
}: AnnouncementTabsProps) {
  const [analysis, setAnalysis] = useState<ComprehensiveResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [subTab, setSubTab] = useState<SubTab>("analysis1");
  const [period, setPeriod] = useState("3y");
  const [categoryFilter, setCategoryFilter] = useState<"same" | "all">("same");
  const [orgScope, setOrgScope] = useState<"exact" | "expand">("exact");
  const [statInfo, setStatInfo] = useState<{ sampleSize?: number; fromCache?: boolean }>({});
  const [refreshKey, setRefreshKey] = useState(0);
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
                업종·지역 평균 기준으로 참고용 수치를 제공합니다. 낙찰하한가 <strong>{new Intl.NumberFormat("ko-KR").format(Math.round(bs.lowerLimitPrice))}원</strong> 이상 투찰 필수.
              </div>
            );
            return null;
          })()}

          {/* 사정율 분석 (서브탭 3개) */}
          <div style={{ background: "#fff", border: "1px solid #E8ECF2", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>
              사정율 분석
            </div>
            {/* 서브탭 네비게이션 */}
            <div style={{ display: "flex", gap: 4, marginBottom: 16, padding: 4, background: "#F8FAFC", borderRadius: 10 }}>
              {([
                { key: "analysis1", label: "적중분석1 · 분포" },
                { key: "analysis2", label: "적중분석2 · 흐름" },
                { key: "analysis3", label: "적중분석3 · 구간추천" },
              ] as { key: SubTab; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSubTab(key)}
                  style={{
                    flex: 1,
                    padding: "8px 4px",
                    fontSize: 12,
                    fontWeight: subTab === key ? 600 : 400,
                    color: subTab === key ? "#1B3A6B" : "#64748B",
                    background: subTab === key ? "#fff" : "transparent",
                    border: "none",
                    borderRadius: 7,
                    cursor: "pointer",
                    boxShadow: subTab === key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                    transition: "all 0.15s",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* 기간 선택기 + 업종 필터 토글 */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: 1 }}>
                <SajungPeriodSelector
                  value={period}
                  onChange={(p) => { setPeriod(p); setStatInfo({}); }}
                  sampleSize={statInfo.sampleSize}
                  fromCache={statInfo.fromCache}
                  onClearCache={async () => {
                    await fetch(`/api/analysis/sajung-cache?annId=${encodeURIComponent(annDbId)}`, { method: "DELETE" });
                    setStatInfo({});
                    setRefreshKey((k) => k + 1);
                  }}
                />
              </div>
              <div style={{ display: "flex", background: "#F1F5F9", borderRadius: 8, padding: 3, gap: 2, flexShrink: 0 }}>
                {(["same", "all"] as const).map((cf) => (
                  <button
                    key={cf}
                    onClick={() => { setCategoryFilter(cf); setStatInfo({}); }}
                    style={{
                      padding: "5px 10px",
                      fontSize: 11,
                      fontWeight: categoryFilter === cf ? 600 : 400,
                      color: categoryFilter === cf ? "#1B3A6B" : "#64748B",
                      background: categoryFilter === cf ? "#fff" : "transparent",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                      boxShadow: categoryFilter === cf ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {cf === "same" ? "동일업종" : "전체업종"}
                  </button>
                ))}
              </div>
            </div>
            {/* 발주처 범위 토글 */}
            {(() => {
              const coreOrg = extractCoreOrgName(orgName);
              return (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#94A3B8", flexShrink: 0 }}>발주처</span>
                  <div style={{ display: "flex", background: "#F1F5F9", borderRadius: 8, padding: 3, gap: 2 }}>
                    {(["exact", "expand"] as const).map((scope) => (
                      <button
                        key={scope}
                        onClick={() => { setOrgScope(scope); setStatInfo({}); }}
                        style={{
                          padding: "5px 10px",
                          fontSize: 11,
                          fontWeight: orgScope === scope ? 600 : 400,
                          color: orgScope === scope ? "#1B3A6B" : "#64748B",
                          background: orgScope === scope ? "#fff" : "transparent",
                          border: "none",
                          borderRadius: 6,
                          cursor: "pointer",
                          boxShadow: orgScope === scope ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                          whiteSpace: "nowrap",
                          maxWidth: 160,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={scope === "exact" ? orgName : `${coreOrg} 포함 전체`}
                      >
                        {scope === "exact" ? orgName : `${coreOrg} 전체`}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            {/* expand 모드 amber 배너 */}
            {orgScope === "expand" && (
              <div style={{ padding: "8px 12px", background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, fontSize: 11, color: "#92400E" }}>
                {extractCoreOrgName(orgName)} 이름을 포함한 모든 발주처 데이터를 포함합니다
                <span style={{ color: "#B45309", marginLeft: 4 }}>
                  (명칭 변경 전 기관 포함)
                </span>
              </div>
            )}
            {/* 서브탭 콘텐츠 — refreshKey / categoryFilter / orgScope 변경 시 언마운트→리마운트 */}
            {subTab === "analysis1" && (
              <>
                {bs?.trend && bs.trend.direction !== "stable" && (
                  <div style={{
                    fontSize: 11,
                    color: bs.trend.direction === "up" ? "#DC2626" : "#2563EB",
                    background: bs.trend.direction === "up" ? "#FEF2F2" : "#EFF6FF",
                    borderRadius: 4,
                    padding: "2px 8px",
                    marginBottom: 8,
                    display: "inline-block",
                    fontWeight: 600,
                  }}>
                    {bs.trend.direction === "up" ? "↑" : "↓"}{" "}
                    {bs.trend.strength === "strong" ? "강한" : bs.trend.strength === "moderate" ? "완만한" : "소폭"}
                    {bs.trend.direction === "up" ? " 상승" : " 하락"} 추세 반영됨
                  </div>
                )}
                <SajungHistogram
                  key={`h-${refreshKey}-${categoryFilter}-${orgScope}`}
                  annId={annDbId}
                  predictedSajungRate={bs?.predictedSajungRate}
                  lowerLimitRate={lowerLimitRate}
                  period={period}
                  categoryFilter={categoryFilter}
                  orgScope={orgScope}
                  onLoad={(sz, fc) => setStatInfo({ sampleSize: sz, fromCache: fc })}
                />
              </>
            )}
            {subTab === "analysis2" && (
              <SajungTrendOverlay
                key={`t-${refreshKey}-${categoryFilter}-${orgScope}`}
                annId={annDbId}
                userId={userIdRef.current}
                predictedSajungRate={bs?.predictedSajungRate}
                period={period}
                categoryFilter={categoryFilter}
                orgScope={orgScope}
                onLoad={(sz, fc) => setStatInfo({ sampleSize: sz, fromCache: fc })}
              />
            )}
            {subTab === "analysis3" && (
              <SajungTopTen
                key={`top-${refreshKey}-${categoryFilter}-${orgScope}`}
                annId={annDbId}
                predictedSajungRate={bs?.predictedSajungRate}
                budget={budget}
                period={period}
                categoryFilter={categoryFilter}
                orgScope={orgScope}
                onLoad={(sz, fc) => setStatInfo({ sampleSize: sz, fromCache: fc })}
              />
            )}
          </div>

          {/* WinProbCalculator */}
          <WinProbCalculator
            budget={budget}
            sajungMean={bs.predictedSajungRate}
            sajungStd={Math.max(0.3, ((bs.sajungRateRange?.p75 ?? 106) - (bs.sajungRateRange?.p25 ?? 101)) / 1.35)}
            lowerLimitRate={lowerLimitRate}
            optimalBidPrice={bs.optimalBidPrice}
            lowerLimitPrice={bs.lowerLimitPrice}
          />

        </div>
      )}
    </div>
  );
}
