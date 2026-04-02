"use client";

import { useState, useEffect, useCallback } from "react";
import { NumberAnalysisSection } from "./NumberAnalysisSection";
import { WinProbCalculator } from "./WinProbCalculator";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface BidHistoryRow {
  bidRate: string;
  finalPrice: string;
  numBidders: number;
  sajungRate: number | null;
  winnerName?: string | null;
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
  };
  competition: {
    competitionScore: number;
    expectedBidders: number;
    dominantCompany: string | null;
    dominantWinRate: number | null;
  };
  meta: {
    isFallback: boolean;
    disclaimer: string;
    sampleSize?: number;
  };
}

interface QualificationResult {
  verdict: "PASS" | "UNCERTAIN" | "FAIL" | "N/A";
  passProbability?: number;
  reasons: string[];
}

export interface AnnouncementTabsProps {
  annId: string;
  annDbId: string;
  orgName: string;
  budget: number;
  lowerLimitRate: number;    // %
  multiplePrice: boolean;
  isClosed: boolean;
  bidMethod: string;
  bidHistory: BidHistoryRow[];
  avgBidRate: string | null;
}

// ─── 숫자 포맷 ───────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.round(n)) + "원";
}

// ─── SVG 반원 게이지 (Recharts 미사용) ───────────────────────────────────────

function SemicircleGauge({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(value / max, 1);
  const r = 60;
  const cx = 80, cy = 80;
  const startAngle = Math.PI;
  const endAngle = 0;
  const totalAngle = Math.abs(endAngle - startAngle);
  const fillAngle = startAngle - pct * totalAngle;

  // 원호 계산
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(fillAngle);
  const y2 = cy + r * Math.sin(fillAngle);
  const largeArc = pct > 0.5 ? 1 : 0;

  const color = value >= 75 ? "#DC2626" : value >= 50 ? "#D97706" : value >= 25 ? "#1B3A6B" : "#16A34A";
  const label = value >= 75 ? "매우높음" : value >= 50 ? "높음" : value >= 25 ? "보통" : "낮음";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={160} height={90} viewBox="0 0 160 90">
        {/* 배경 호 */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="#E8ECF2" strokeWidth={14} strokeLinecap="round"
        />
        {/* 값 호 */}
        {pct > 0.01 && (
          <path
            d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
            fill="none" stroke={color} strokeWidth={14} strokeLinecap="round"
          />
        )}
        {/* 중앙 텍스트 */}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={22} fontWeight={800} fill={color}>{value}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11} fill="#94A3B8">{label}</text>
      </svg>
      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: -4 }}>경쟁 강도 (0~100)</div>
    </div>
  );
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

const TABS = [
  { id: "strategy",    label: "투찰 전략",  hash: "#tab-strategy" },
  { id: "competition", label: "경쟁 분석",  hash: "#tab-competition" },
  { id: "qualification", label: "참여 적합성", hash: "#tab-qualification" },
];

export function AnnouncementTabs({
  annId, annDbId, orgName, budget, lowerLimitRate, multiplePrice, isClosed, bidMethod,
  bidHistory, avgBidRate,
}: AnnouncementTabsProps) {
  const [activeTab, setActiveTab] = useState("strategy");
  const [analysis, setAnalysis] = useState<ComprehensiveResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [qualification, setQualification] = useState<QualificationResult | null>(null);

  // URL 해시 → 탭 동기화
  useEffect(() => {
    const hash = window.location.hash.replace("#tab-", "");
    if (TABS.some(t => t.id === hash)) setActiveTab(hash);
  }, []);

  function switchTab(id: string) {
    setActiveTab(id);
    window.history.replaceState(null, "", `#tab-${id}`);
  }

  // 통합 분석 API 호출 (마운트 시 1회)
  const fetchAnalysis = useCallback(async () => {
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
      }
    } catch { /* 분석 실패는 무시 */ }
    setAnalysisLoading(false);
  }, [annDbId]);

  // 적격심사 API 호출 (탭3 클릭 시)
  const fetchQualification = useCallback(async () => {
    if (qualification) return;
    try {
      const res = await fetch("/api/analysis/qualification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annId: annDbId }),
      });
      if (res.ok) {
        const data = (await res.json()) as QualificationResult;
        setQualification(data);
      }
    } catch { /* 무시 */ }
  }, [annDbId, qualification]);

  useEffect(() => { void fetchAnalysis(); }, [fetchAnalysis]);

  const bs = analysis?.bidStrategy;
  const comp = analysis?.competition;

  const tabStyle = (id: string): React.CSSProperties => ({
    padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer",
    color: activeTab === id ? "#1B3A6B" : "#64748B",
    background: "none", border: "none",
    borderBottom: `3px solid ${activeTab === id ? "#1B3A6B" : "transparent"}`,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* 탭 헤더 */}
      <div style={{
        display: "flex", borderBottom: "1px solid #E8ECF2",
        background: "#fff", borderRadius: "12px 12px 0 0",
        border: "1px solid #E8ECF2",
      }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { switchTab(t.id); if (t.id === "qualification") void fetchQualification(); }}
            style={tabStyle(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <div style={{ background: "#fff", border: "1px solid #E8ECF2", borderTop: "none", borderRadius: "0 0 12px 12px", padding: "20px 24px" }}>

        {/* ─── 탭1: 투찰 전략 ─── */}
        {activeTab === "strategy" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {analysisLoading ? (
              <div style={{ color: "#94A3B8", textAlign: "center", padding: "40px 0" }}>AI 분석 중...</div>
            ) : !bs ? (
              <div style={{ color: "#94A3B8", textAlign: "center", padding: "40px 0" }}>분석 데이터를 불러올 수 없습니다.</div>
            ) : (
              <>
                {/* 신뢰도 경고 배너 */}
                {(() => {
                  const cl = bs.confidenceLevel ?? (bs.isFallback ? "LOW" : bs.sampleSize >= 30 ? "HIGH" : "MEDIUM");
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
                  const cl = bs.confidenceLevel ?? (bs.isFallback ? "LOW" : bs.sampleSize >= 30 ? "HIGH" : "MEDIUM");
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
                          label: "낙찰 확률",
                          value: cl === "LOW" ? "-" : `${Math.round(bs.winProbability * 100)}%`,
                          sub: bs.isFallback ? `데이터 부족 (${bs.sampleSize}건)` : `${bs.sampleSize}건 기반`,
                          color: cl === "LOW" ? "#94A3B8" : bs.winProbability >= 0.6 ? "#16A34A" : bs.winProbability >= 0.35 ? "#D97706" : "#DC2626",
                        },
                        {
                          label: "경쟁 강도",
                          value: comp ? `${comp.competitionScore}점` : "-",
                          sub: comp ? `예상 ${comp.expectedBidders}개사 참여` : "",
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
                    <NumberAnalysisSection annId={annId} isClosed={isClosed} bidMethod={bidMethod} />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ─── 탭2: 경쟁 분석 ─── */}
        {activeTab === "competition" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {!comp ? (
              <div style={{ color: "#94A3B8", textAlign: "center", padding: "40px 0" }}>
                {analysisLoading ? "분석 중..." : "경쟁 분석 데이터 없음"}
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <SemicircleGauge value={comp.competitionScore} />
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>
                      경쟁 분석 요약
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {[
                        { label: "예상 참여사 수", value: `약 ${comp.expectedBidders}개사` },
                        { label: "독점 기업", value: comp.dominantCompany ?? "특이 패턴 없음" },
                        ...(comp.dominantWinRate !== null ? [{ label: "독점 낙찰률", value: `${Math.round(comp.dominantWinRate * 100)}%` }] : []),
                      ].map(row => (
                        <div key={row.label} style={{ display: "flex", gap: 12 }}>
                          <span style={{ fontSize: 12, color: "#94A3B8", minWidth: 100 }}>{row.label}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 독점 패턴 경고 */}
                {comp.dominantWinRate !== null && comp.dominantWinRate >= 0.4 && (
                  <div style={{ padding: "12px 16px", background: "#FEF2F2", borderRadius: 10, border: "1px solid #FECACA" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#DC2626", marginBottom: 4 }}>
                      ⚠️ 독점 패턴 감지
                    </div>
                    <div style={{ fontSize: 12, color: "#7F1D1D" }}>
                      <strong>{comp.dominantCompany}</strong>이 최근 유사 공고의 {Math.round(comp.dominantWinRate * 100)}%를 낙찰받았습니다.
                      경쟁이 어려울 수 있습니다.
                    </div>
                  </div>
                )}

                {/* 발주처 낙찰이력 (사정율 컬럼 추가) */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>발주처 낙찰이력</div>
                    {avgBidRate && (
                      <span style={{ fontSize: 12, color: "#059669", fontWeight: 600 }}>
                        평균 낙찰률 {avgBidRate}%
                      </span>
                    )}
                  </div>
                  {bidHistory.length === 0 ? (
                    <div style={{ fontSize: 13, color: "#94A3B8", textAlign: "center", padding: "24px 0" }}>
                      낙찰이력 데이터가 없습니다.
                    </div>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "#F8F9FB", borderBottom: "1px solid #E8ECF2" }}>
                            {["낙찰률", "낙찰금액", "참여사", "사정율", "낙찰업체"].map(h => (
                              <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {bidHistory.map((r, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid #F1F5F9" }}>
                              <td style={{ padding: "9px 12px", fontWeight: 700, color: "#1B3A6B" }}>{parseFloat(r.bidRate).toFixed(3)}%</td>
                              <td style={{ padding: "9px 12px" }}>{new Intl.NumberFormat("ko-KR").format(parseInt(r.finalPrice, 10))}원</td>
                              <td style={{ padding: "9px 12px" }}>{r.numBidders}사</td>
                              <td style={{ padding: "9px 12px", color: r.sajungRate !== null ? "#059669" : "#94A3B8" }}>
                                {r.sajungRate !== null ? `${r.sajungRate.toFixed(2)}%` : "-"}
                              </td>
                              <td style={{ padding: "9px 12px", color: "#64748B", fontSize: 12 }}>{r.winnerName ?? "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ─── 탭3: 참여 적합성 ─── */}
        {activeTab === "qualification" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {!qualification ? (
              <div style={{ color: "#94A3B8", textAlign: "center", padding: "40px 0" }}>
                적격심사 데이터를 불러오는 중...
              </div>
            ) : (
              <>
                <div style={{
                  padding: "16px 20px", borderRadius: 12,
                  background: qualification.verdict === "PASS" ? "#F0FDF4" : qualification.verdict === "FAIL" ? "#FEF2F2" : "#FFFBEB",
                  border: `1.5px solid ${qualification.verdict === "PASS" ? "#86EFAC" : qualification.verdict === "FAIL" ? "#FECACA" : "#FDE68A"}`,
                }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: qualification.verdict === "PASS" ? "#16A34A" : qualification.verdict === "FAIL" ? "#DC2626" : "#D97706", marginBottom: 6 }}>
                    {qualification.verdict === "PASS" ? "✓ 적격심사 통과 가능" : qualification.verdict === "FAIL" ? "✗ 적격심사 통과 어려움" : qualification.verdict === "N/A" ? "— 적격심사 대상 아님" : "△ 확인 필요"}
                  </div>
                  {qualification.passProbability !== undefined && (
                    <div style={{ fontSize: 13, color: "#64748B" }}>통과 가능성 {Math.round(qualification.passProbability * 100)}%</div>
                  )}
                </div>

                {qualification.reasons.length > 0 && (
                  <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>판정 근거</div>
                    {qualification.reasons.map((r, i) => (
                      <div key={i} style={{ fontSize: 13, color: "#374151", padding: "6px 0", borderBottom: "1px solid #F1F5F9", display: "flex", gap: 8 }}>
                        <span style={{ color: "#94A3B8" }}>·</span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* 면책 고지 */}
            <div style={{
              background: "#FFF7ED", border: "1px solid #FDE68A", borderRadius: 8,
              padding: "10px 12px", fontSize: 12, color: "#92400E", fontWeight: 500,
            }}>
              ⚠ AI 분석 결과는 통계적 참고 자료입니다. 낙찰을 보장하지 않습니다. 실제 입찰 전 반드시 전문가와 검토하세요.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
