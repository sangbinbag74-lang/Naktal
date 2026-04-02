"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Rec {
  id: string;
  annId: string | null;
  annTitle: string | null;
  annOrgName: string | null;
  annBudget: string | null;
  annDeadline: string | null;
  category: string | null;
  budgetRange: string | null;
  region: string | null;
  combo1: number[];
  combo2: number[];
  combo3: number[];
  hitRate1: number;
  hitRate2: number;
  hitRate3: number;
  sampleSize: number;
  modelVersion: string;
  createdAt: string;
}

interface Outcome {
  id: string;
  annId: string;
  annTitle: string | null;
  annOrgName: string | null;
  bidPrice: string | null;
  result: "WIN" | "LOSE" | "DISQUALIFIED" | "PENDING";
  actualSajungRate: string | null;
  actualFinalPrice: string | null;
  numBidders: number | null;
  bidAt: string;
  openedAt: string | null;
}

function NumBadge({ n, accent }: { n: number; accent: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 28, height: 28, borderRadius: "50%",
      background: accent, color: "#fff", fontSize: 12, fontWeight: 700,
    }}>
      {String(n).padStart(2, "0")}
    </span>
  );
}

function fmt(n: number) { return n.toLocaleString("ko-KR") + "원"; }

const resultConfig = {
  WIN:           { label: "낙찰", bg: "#ECFDF5", color: "#059669", border: "#A7F3D0" },
  LOSE:          { label: "유찰", bg: "#FEF2F2", color: "#DC2626", border: "#FECACA" },
  DISQUALIFIED:  { label: "적격심사 탈락", bg: "#FFF7ED", color: "#D97706", border: "#FED7AA" },
  PENDING:       { label: "개찰 전", bg: "#F1F5F9", color: "#64748B", border: "#CBD5E1" },
};

export default function HistoryPage() {
  const [recs, setRecs] = useState<Rec[]>([]);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"outcomes" | "numbers">("outcomes");

  useEffect(() => {
    Promise.all([
      fetch("/api/strategy/history").then((r) => r.json()),
      fetch("/api/outcome/history").then((r) => r.json()),
    ])
      .then(([recData, outcomeData]) => {
        if (recData.error) { setError(recData.error); }
        else { setRecs(recData.recommendations ?? []); setTotal(recData.total ?? 0); }
        if (!outcomeData.error) setOutcomes(outcomeData.outcomes ?? []);
      })
      .catch(() => setError("데이터를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, color: "#94A3B8" }}>로딩 중...</div>;

  // 성과 통계
  const finishedOutcomes = outcomes.filter((o) => o.result !== "PENDING");
  const wins = finishedOutcomes.filter((o) => o.result === "WIN");
  const winRate = finishedOutcomes.length > 0 ? (wins.length / finishedOutcomes.length) * 100 : 0;

  // AI 추천 vs 내 투찰가 오차 (추후 BidPricePrediction 연동 시 계산, 현재는 placeholder)
  const aiAccuracyText = "데이터 수집 중";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>투찰 이력</h2>
          <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>투찰 결과 + 번호 추천 이력을 확인하세요.</p>
        </div>
      </div>

      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "14px 18px", fontSize: 13, color: "#DC2626" }}>
          {error}
        </div>
      )}

      {/* 섹션1: 성과 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[
          { label: "총 투찰 건수", value: outcomes.length + "건" },
          { label: "낙찰 건수", value: wins.length + "건", color: wins.length > 0 ? "#059669" : "#374151" },
          { label: "낙찰률", value: finishedOutcomes.length > 0 ? winRate.toFixed(1) + "%" : "-", color: winRate >= 30 ? "#059669" : winRate >= 10 ? "#D97706" : "#374151" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "16px" }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: color ?? "#374151" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* AI vs 내 투찰가 비교 배너 */}
      {outcomes.length > 0 && (
        <div style={{ background: "#EFF6FF", borderRadius: 12, padding: "14px 18px", fontSize: 13, color: "#1B3A6B", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>🤖</span>
          <div>
            <strong>AI 추천 투찰가 오차:</strong>{" "}{aiAccuracyText}
            <span style={{ fontSize: 12, color: "#64748B", marginLeft: 8 }}>
              결과를 더 입력할수록 정확해집니다.
            </span>
          </div>
        </div>
      )}

      {/* 탭 */}
      <div style={{ display: "flex", gap: 4, borderBottom: "2px solid #E8ECF2", paddingBottom: 0 }}>
        {(["outcomes", "numbers"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 18px", border: "none", background: "none", cursor: "pointer",
              fontSize: 13, fontWeight: tab === t ? 700 : 400,
              color: tab === t ? "#1B3A6B" : "#94A3B8",
              borderBottom: tab === t ? "2px solid #1B3A6B" : "2px solid transparent",
              marginBottom: -2,
            }}
          >
            {t === "outcomes" ? `투찰 결과 (${outcomes.length})` : `번호 추천 (${total})`}
          </button>
        ))}
      </div>

      {/* 섹션2: 투찰 결과 타임라인 */}
      {tab === "outcomes" && (
        <>
          {outcomes.length === 0 ? (
            <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "56px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginBottom: 8 }}>아직 투찰 결과가 없습니다</div>
              <div style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 20 }}>공고 분석 후 결과를 입력해주시면 AI가 더 정확해집니다</div>
              <Link href="/announcements" style={{
                display: "inline-block", background: "#1B3A6B", color: "#fff",
                padding: "10px 24px", borderRadius: 10, textDecoration: "none",
                fontWeight: 600, fontSize: 14,
              }}>공고 목록 보기</Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {outcomes.map((o) => {
                const cfg = resultConfig[o.result] ?? resultConfig.PENDING;
                const bidPriceNum = o.bidPrice ? parseInt(o.bidPrice, 10) : null;
                return (
                  <div key={o.id} style={{
                    background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2",
                    padding: "18px 22px", display: "flex", flexDirection: "column", gap: 10,
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 3 }}>
                          {new Date(o.bidAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}
                          {o.annOrgName && <span style={{ marginLeft: 8 }}>{o.annOrgName}</span>}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {o.annTitle ?? o.annId}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <span style={{
                          fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 6,
                          background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
                        }}>
                          {cfg.label}
                        </span>
                        {o.result === "PENDING" && (
                          <Link href={`/my/outcome/${o.annId}`} style={{
                            fontSize: 12, padding: "4px 12px", borderRadius: 7,
                            background: "#EEF2FF", color: "#1B3A6B", fontWeight: 600, textDecoration: "none",
                          }}>결과 입력</Link>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
                      {bidPriceNum && (
                        <span style={{ color: "#374151" }}>
                          <span style={{ color: "#9CA3AF" }}>투찰가</span>{" "}<strong>{fmt(bidPriceNum)}</strong>
                        </span>
                      )}
                      {o.actualSajungRate && (
                        <span style={{ color: "#374151" }}>
                          <span style={{ color: "#9CA3AF" }}>실제 사정율</span>{" "}<strong>{parseFloat(o.actualSajungRate).toFixed(2)}%</strong>
                        </span>
                      )}
                      {o.numBidders && (
                        <span style={{ color: "#374151" }}>
                          <span style={{ color: "#9CA3AF" }}>참여</span>{" "}<strong>{o.numBidders}사</strong>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 섹션3: 번호 추천 이력 */}
      {tab === "numbers" && (
        <>
          {recs.length === 0 ? (
            <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "56px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginBottom: 8 }}>아직 번호 분석 이력이 없습니다</div>
              <div style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 20 }}>복수예가 공고에서 번호 추천을 받아보세요</div>
              <Link href="/announcements" style={{
                display: "inline-block", background: "#1B3A6B", color: "#fff",
                padding: "10px 24px", borderRadius: 10, textDecoration: "none",
                fontWeight: 600, fontSize: 14,
              }}>공고 목록 보기</Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {recs.map((r) => {
                const isClosed = r.annDeadline ? new Date(r.annDeadline) < new Date() : true;
                const dday = r.annDeadline
                  ? Math.ceil((new Date(r.annDeadline).getTime() - Date.now()) / 86400000)
                  : null;
                return (
                  <div key={r.id} style={{
                    background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2",
                    padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14,
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 3 }}>
                          {new Date(r.createdAt).toLocaleString("ko-KR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          {r.modelVersion && <span style={{ marginLeft: 8, color: "#CBD5E1" }}>{r.modelVersion}</span>}
                        </div>
                        {r.annTitle ? (
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.annTitle}
                          </div>
                        ) : (
                          <div style={{ fontSize: 13, color: "#94A3B8" }}>공고 정보 없음 · {r.category || r.region || r.budgetRange}</div>
                        )}
                        {r.annOrgName && (
                          <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                            {r.annOrgName}{r.annBudget ? ` · ${r.annBudget}` : ""}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        {dday !== null && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 5,
                            background: isClosed ? "#F1F5F9" : dday <= 2 ? "#FEF2F2" : dday <= 7 ? "#FFF7ED" : "#EEF2FF",
                            color: isClosed ? "#94A3B8" : dday <= 2 ? "#DC2626" : dday <= 7 ? "#C2410C" : "#1B3A6B",
                          }}>
                            {isClosed ? "마감" : `D-${dday}`}
                          </span>
                        )}
                        {r.annId && !isClosed && (
                          <Link href={`/announcements/${r.annId}`} style={{
                            fontSize: 12, padding: "4px 12px", borderRadius: 7,
                            background: "#EEF2FF", color: "#1B3A6B", fontWeight: 600, textDecoration: "none",
                          }}>공고 보기</Link>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      {([
                        { combo: r.combo1, hitRate: r.hitRate1, label: "조합 1", accent: "#1B3A6B" },
                        { combo: r.combo2, hitRate: r.hitRate2, label: "조합 2", accent: "#1E40AF" },
                        { combo: r.combo3, hitRate: r.hitRate3, label: "조합 3", accent: "#2563EB" },
                      ] as const).map(({ combo, hitRate, label, accent }) => (
                        <div key={label} style={{
                          flex: 1, minWidth: 140, background: "#F8FAFC", borderRadius: 10, padding: "10px 14px",
                          borderLeft: `3px solid ${accent}`,
                        }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: accent, marginBottom: 8, letterSpacing: "0.05em" }}>
                            {label} · {hitRate?.toFixed(1) ?? "—"}%
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            {(combo ?? []).map((n, i) => <NumBadge key={i} n={n} accent={accent} />)}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: "#CBD5E1" }}>
                      분석 샘플 {(r.sampleSize ?? 0).toLocaleString()}건
                      {r.category && ` · ${r.category}`}
                      {r.region && ` · ${r.region}`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
