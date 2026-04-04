"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { VisitedAnn } from "@/components/naktal/AnnouncementTabs";

interface CachedAnalysis {
  bidStrategy: {
    optimalBidPrice: number;
    predictedSajungRate: number;
    sampleSize: number;
    lowerLimitPrice: number;
    winProbability: number;
    isFallback?: boolean;
  };
}

function fmt(n: number) { return n.toLocaleString("ko-KR") + "원"; }

function getDDay(deadline: string) {
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  if (diff <= 0) return { label: "마감", bg: "#F1F5F9", color: "#94A3B8" };
  if (diff <= 2) return { label: `D-${diff}`, bg: "#FEF2F2", color: "#DC2626" };
  if (diff <= 5) return { label: `D-${diff}`, bg: "#FFF7ED", color: "#C2410C" };
  if (diff <= 10) return { label: `D-${diff}`, bg: "#EFF6FF", color: "#1E40AF" };
  return { label: `D-${diff}`, bg: "#F1F5F9", color: "#475569" };
}

export default function HistoryPage() {
  const [items, setItems] = useState<{ visited: VisitedAnn; analysis: CachedAnalysis | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id ?? "anon";

      const visited: VisitedAnn[] = JSON.parse(localStorage.getItem(`visited_${uid}`) ?? "[]") as VisitedAnn[];

      const result = visited.map((v) => {
        try {
          const raw = localStorage.getItem(`analysis_${uid}_${v.annDbId}`);
          const analysis = raw ? JSON.parse(raw) as CachedAnalysis : null;
          return { visited: v, analysis };
        } catch {
          return { visited: v, analysis: null };
        }
      });

      setItems(result);
      setLoading(false);
    }
    void load();
  }, []);

  if (loading) return <div style={{ padding: 40, color: "#94A3B8" }}>불러오는 중...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>분석 이력</h2>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>확인한 공고 {items.length}건 · 분석 결과는 내 기기에 저장됩니다</p>
      </div>

      {items.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "56px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginBottom: 8 }}>아직 확인한 공고가 없습니다</div>
          <div style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 20 }}>공고 목록에서 공고를 클릭하면 이곳에 기록됩니다</div>
          <Link href="/announcements" style={{
            display: "inline-block", background: "#1B3A6B", color: "#fff",
            padding: "10px 24px", borderRadius: 10, textDecoration: "none",
            fontWeight: 600, fontSize: 14,
          }}>공고 목록 보기</Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map(({ visited: v, analysis }) => {
            const dday = getDDay(v.deadline);
            const bs = analysis?.bidStrategy;
            return (
              <Link
                key={v.annDbId}
                href={`/announcements/${v.annDbId}`}
                style={{ textDecoration: "none" }}
              >
                <div style={{
                  background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2",
                  padding: "18px 22px", display: "flex", flexDirection: "column", gap: 10,
                  cursor: "pointer",
                  transition: "box-shadow 0.15s",
                }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 12px rgba(27,58,107,0.10)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
                >
                  {/* 헤더 */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 5, marginBottom: 6, flexWrap: "wrap" }}>
                        {v.category && (
                          <span style={{ fontSize: 10, fontWeight: 600, background: "#EEF2FF", color: "#1B3A6B", padding: "2px 6px", borderRadius: 4 }}>
                            {v.category}
                          </span>
                        )}
                        {v.region && (
                          <span style={{ fontSize: 10, fontWeight: 600, background: "#F8FAFC", color: "#64748B", padding: "2px 6px", borderRadius: 4 }}>
                            {v.region}
                          </span>
                        )}
                        {v.multiplePrice && (
                          <span style={{ fontSize: 10, fontWeight: 600, background: "#ECFDF5", color: "#059669", padding: "2px 6px", borderRadius: 4 }}>
                            복수예가
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {v.title}
                      </div>
                      <div style={{ fontSize: 12, color: "#64748B", marginTop: 3 }}>
                        {v.orgName} · 기초금액 {fmt(v.budget)}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: dday.bg, color: dday.color }}>
                        {dday.label}
                      </span>
                      <span style={{ fontSize: 10, color: "#CBD5E1" }}>
                        {new Date(v.visitedAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })} 확인
                      </span>
                    </div>
                  </div>

                  {/* 분석 결과 */}
                  {bs ? (
                    <div style={{ display: "flex", gap: 12, background: "#F8FAFC", borderRadius: 10, padding: "12px 14px", flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 2 }}>AI 추천 투찰가</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#1B3A6B" }}>{fmt(bs.optimalBidPrice)}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 100 }}>
                        <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 2 }}>예측 사정율</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#374151" }}>{bs.predictedSajungRate.toFixed(2)}%</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 80 }}>
                        <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 2 }}>분석 샘플</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: bs.sampleSize >= 10 ? "#374151" : "#D97706" }}>
                          {bs.sampleSize.toLocaleString()}건
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "#CBD5E1", padding: "8px 0" }}>분석 결과 없음 — 공고를 열면 분석이 시작됩니다</div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
