"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface MyRequest {
  id: string;
  annId: string;
  konepsId: string;
  title: string;
  orgName: string;
  deadline: string;
  recommendedBidPrice: number;
  predictedSajungRate: number | null;
  contractAt: string | null;
}
interface RecommendedAnn {
  id: string;
  konepsId: string;
  title: string;
  orgName: string;
  category: string;
  region: string;
  budget: number;
  deadline: string;
  predictedSajungRate: number | null;
  optimalBidPrice: number | null;
  winProbability: number | null;
}
interface UrgentAnn {
  id: string;
  konepsId: string;
  title: string;
  orgName: string;
  category: string;
  budget: number;
  deadline: string;
}
interface DashboardData {
  myRequests: MyRequest[];
  recommended: RecommendedAnn[];
  urgent: UrgentAnn[];
  metrics: {
    myRequestsThisMonth: number;
    totalActive: number;
    todayNew: number;
    plan: string;
  };
  accuracy: {
    total: number;
    hitRate: number;
    exactRate: number;
    avgDev: number;
  };
  profileSet: boolean;
}

function fmtPrice(n: number): string {
  if (!n) return "-";
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}
function fmtPct(n: number | null, d = 2): string {
  if (n == null) return "-";
  return `${n.toFixed(d)}%`;
}
function getDDay(deadline: string): { label: string; color: string } {
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  if (diff <= 0) return { label: "마감", color: "#475569" };
  if (diff <= 2) return { label: `D-${diff}`, color: "#DC2626" };
  if (diff <= 5) return { label: `D-${diff}`, color: "#C2410C" };
  if (diff <= 10) return { label: `D-${diff}`, color: "#1E40AF" };
  return { label: `D-${diff}`, color: "#475569" };
}

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  border: "1px solid #E8ECF2",
  padding: "20px 24px",
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let aborted = false;
    fetch("/api/dashboard/home")
      .then((r) => r.json())
      .then((j) => {
        if (!aborted) {
          if (!j.error) setData(j as DashboardData);
          setLoading(false);
        }
      })
      .catch(() => { if (!aborted) setLoading(false); });
    return () => { aborted = true; };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 헤더 + 1줄 지표 */}
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: 0 }}>대시보드</h2>
        <div style={{
          marginTop: 8, display: "flex", gap: 18, flexWrap: "wrap",
          fontSize: 13, color: "#64748B",
        }}>
          {!loading && data && (
            <>
              <span>이번달 의뢰 <strong style={{ color: "#1B3A6B" }}>{data.metrics.myRequestsThisMonth}</strong>건</span>
              <span>·</span>
              <span>활성 공고 <strong style={{ color: "#1B3A6B" }}>{data.metrics.totalActive.toLocaleString()}</strong>건</span>
              <span>·</span>
              <span>오늘 신규 <strong style={{ color: "#1B3A6B" }}>{data.metrics.todayNew.toLocaleString()}</strong>건</span>
              <span>·</span>
              <span>플랜 <strong style={{ color: "#059669" }}>{data.metrics.plan?.toUpperCase() ?? "-"}</strong></span>
            </>
          )}
        </div>
      </div>

      {/* 1. 진행중 내 의뢰 */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>📌 진행중 내 의뢰</span>
          <Link href="/contracts" style={{ fontSize: 12, color: "#60A5FA", textDecoration: "none" }}>전체 보기 →</Link>
        </div>
        {loading ? <div style={loadingStyle}>불러오는 중...</div>
         : !data || data.myRequests.length === 0 ? (
          <div style={emptyStyle}>
            <div style={{ fontSize: 13, color: "#94A3B8", marginBottom: 8 }}>진행중인 의뢰가 없습니다.</div>
            <Link href="/announcements" style={emptyLinkStyle}>공고 둘러보기 →</Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.myRequests.map((r) => {
              const dday = getDDay(r.deadline);
              const href = r.contractAt ? `/bid-result/${r.konepsId}` : `/bid-contract/${r.konepsId}`;
              return (
                <Link key={r.id} href={href} target="_blank" rel="noopener noreferrer" style={rowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={titleStyle}>{r.title}</div>
                    <div style={subStyle}>
                      {r.orgName} · 추천 {fmtPrice(r.recommendedBidPrice)}원
                      {r.predictedSajungRate != null && ` · 사정율 ${fmtPct(r.predictedSajungRate)}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: dday.color }}>{dday.label}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: r.contractAt ? "#059669" : "#1B3A6B",
                      background: r.contractAt ? "#ECFDF5" : "#EEF2FF",
                      padding: "4px 8px", borderRadius: 6,
                    }}>
                      {r.contractAt ? "✓ 계약 완료" : "계약 대기"}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. AI 추천 공고 (내 업종/지역 매칭) */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>🎯 AI 추천 공고</span>
            <span style={{ fontSize: 10, fontWeight: 700, background: "#EEF2FF", color: "#1B3A6B", padding: "2px 7px", borderRadius: 4, marginLeft: 8 }}>내 업종 매칭</span>
          </div>
          <Link href="/announcements" style={{ fontSize: 12, color: "#60A5FA", textDecoration: "none" }}>전체 →</Link>
        </div>
        {!loading && data && !data.profileSet && (
          <div style={{ ...emptyStyle, marginBottom: 12, background: "#FEF3C7", border: "1px solid #FDE68A" }}>
            <div style={{ fontSize: 13, color: "#92400E", marginBottom: 6 }}>
              💡 업체 정보를 등록하면 더 정확한 매칭을 받을 수 있습니다.
            </div>
            <Link href="/profile" style={{ ...emptyLinkStyle, color: "#92400E" }}>업체 정보 등록 →</Link>
          </div>
        )}
        {loading ? <div style={loadingStyle}>불러오는 중...</div>
         : !data || data.recommended.length === 0 ? (
          <div style={emptyStyle}>
            <div style={{ fontSize: 13, color: "#94A3B8" }}>매칭되는 활성 공고가 없습니다.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.recommended.map((a) => {
              const dday = getDDay(a.deadline);
              return (
                <Link key={a.id} href={`/announcements/${a.konepsId}`} style={rowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={titleStyle}>{a.title}</div>
                    <div style={subStyle}>
                      {a.orgName} · {a.category} · {a.region} · {fmtPrice(a.budget)}원
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {a.optimalBidPrice != null && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: "#1B3A6B",
                        background: "#EEF2FF", padding: "4px 8px", borderRadius: 6,
                      }}>
                        AI {fmtPrice(a.optimalBidPrice)}
                      </span>
                    )}
                    <span style={{ fontSize: 11, fontWeight: 700, color: dday.color }}>{dday.label}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. 마감 임박 D-3 */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>⏰ 마감 임박 (D-3 이내)</span>
          <Link href="/announcements?sort=deadline" style={{ fontSize: 12, color: "#60A5FA", textDecoration: "none" }}>전체 →</Link>
        </div>
        {loading ? <div style={loadingStyle}>불러오는 중...</div>
         : !data || data.urgent.length === 0 ? (
          <div style={emptyStyle}>
            <div style={{ fontSize: 13, color: "#94A3B8" }}>마감 임박 공고가 없습니다.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.urgent.map((a) => {
              const dday = getDDay(a.deadline);
              return (
                <Link key={a.id} href={`/announcements/${a.konepsId}`} style={rowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={titleStyle}>{a.title}</div>
                    <div style={subStyle}>{a.orgName} · {a.category} · {fmtPrice(a.budget)}원</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: dday.color }}>{dday.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. 모델 정확도 (지난 30일) */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>📊 AI 정확도 (지난 30일)</span>
          <Link href="/admin/accuracy" style={{ fontSize: 12, color: "#60A5FA", textDecoration: "none" }}>상세 →</Link>
        </div>
        {loading ? <div style={loadingStyle}>불러오는 중...</div>
         : !data || data.accuracy.total === 0 ? (
          <div style={emptyStyle}>
            <div style={{ fontSize: 13, color: "#94A3B8" }}>아직 결과 입력된 의뢰가 없습니다.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              { label: "검증 건수", value: `${data.accuracy.total}건` },
              { label: "적중률 (±0.5%p)", value: `${data.accuracy.hitRate.toFixed(1)}%`, color: "#059669" },
              { label: "정확 적중 (±0.1%p)", value: `${data.accuracy.exactRate.toFixed(1)}%`, color: "#1B3A6B" },
              { label: "평균 편차", value: `${data.accuracy.avgDev.toFixed(2)}%p`, color: "#C2410C" },
            ].map((m) => (
              <div key={m.label} style={{ background: "#F8FAFC", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>{m.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: m.color ?? "#0F172A" }}>{m.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const loadingStyle: React.CSSProperties = { padding: "24px", textAlign: "center", color: "#94A3B8", fontSize: 13 };
const emptyStyle: React.CSSProperties = { background: "#F8FAFC", borderRadius: 10, padding: "20px", textAlign: "center" };
const emptyLinkStyle: React.CSSProperties = { fontSize: 12, color: "#1B3A6B", fontWeight: 600, textDecoration: "none", display: "inline-block", marginTop: 4 };
const rowStyle: React.CSSProperties = {
  background: "#F8FAFC", borderRadius: 10, border: "1px solid #E8ECF2",
  padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
  textDecoration: "none", color: "inherit",
};
const titleStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: "#0F172A",
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
const subStyle: React.CSSProperties = { fontSize: 11, color: "#64748B", marginTop: 2 };
