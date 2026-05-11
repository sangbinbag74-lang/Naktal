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
  profileSet: boolean;
}

function fmtPrice(n: number): string {
  if (!n) return "-";
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
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
  background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2",
  padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10,
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", margin: 0 }}>대시보드</h2>
      </div>

      {/* 메트릭 3박스 — 1줄 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <MetricBox label="이번달 의뢰" value={loading || !data ? "-" : `${data.metrics.myRequestsThisMonth}건`} color="#1B3A6B" />
        <MetricBox label="활성 공고"   value={loading || !data ? "-" : data.metrics.totalActive.toLocaleString()} sub="건" color="#0F172A" />
        <MetricBox label="오늘 신규"   value={loading || !data ? "-" : data.metrics.todayNew.toLocaleString()} sub="건" color="#0F172A" />
      </div>

      {/* 컨텐츠 3박스 — 1행 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {/* 1. 진행중 내 의뢰 */}
        <div style={cardStyle}>
          <BoxHeader icon="📌" title="진행중 내 의뢰" href="/contracts" />
          {loading ? <Loading />
           : !data || data.myRequests.length === 0 ? (
            <Empty msg="진행중인 의뢰가 없습니다" linkHref="/announcements" linkText="공고 둘러보기" />
          ) : (
            <div style={listStyle}>
              {data.myRequests.slice(0, 3).map((r) => {
                const dday = getDDay(r.deadline);
                const href = r.contractAt ? `/bid-result/${r.konepsId}` : `/bid-contract/${r.konepsId}`;
                return (
                  <Link key={r.id} href={href} target="_blank" rel="noopener noreferrer" style={rowStyle}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={titleStyle}>{r.title}</div>
                      <div style={subStyle}>{r.orgName}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: dday.color }}>{dday.label}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 600,
                        color: r.contractAt ? "#059669" : "#1B3A6B",
                        background: r.contractAt ? "#ECFDF5" : "#EEF2FF",
                        padding: "2px 7px", borderRadius: 4,
                      }}>
                        {r.contractAt ? "✓계약" : "대기"}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. AI 추천 공고 */}
        <div style={cardStyle}>
          <BoxHeader icon="🎯" title="AI 추천 공고" href="/announcements" badge="내 업종" />
          {!loading && data && !data.profileSet && (
            <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, padding: "8px 12px" }}>
              <div style={{ fontSize: 11, color: "#1E40AF", marginBottom: 2 }}>업종·지역 등록 시 맞춤 추천</div>
              <Link href="/profile" style={{ fontSize: 11, color: "#1E40AF", fontWeight: 600, textDecoration: "none" }}>
                내 업체 정보에서 등록 →
              </Link>
            </div>
          )}
          {loading ? <Loading />
           : !data || data.recommended.length === 0 ? (
            <Empty msg="매칭 공고 없음" />
          ) : (
            <div style={listStyle}>
              {data.recommended.slice(0, 3).map((a) => {
                const dday = getDDay(a.deadline);
                return (
                  <Link key={a.id} href={`/announcements/${a.konepsId}`} style={rowStyle}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={titleStyle}>{a.title}</div>
                      <div style={subStyle}>{a.category} · {a.region} · {fmtPrice(a.budget)}원</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      {a.optimalBidPrice != null && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#1B3A6B", background: "#EEF2FF", padding: "2px 6px", borderRadius: 4 }}>
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
          <BoxHeader icon="⏰" title="마감 임박 (D-3 이내)" href="/announcements?sort=deadline" />
          {loading ? <Loading />
           : !data || data.urgent.length === 0 ? (
            <Empty msg="마감 임박 공고 없음" />
          ) : (
            <div style={listStyle}>
              {data.urgent.slice(0, 3).map((a) => {
                const dday = getDDay(a.deadline);
                return (
                  <Link key={a.id} href={`/announcements/${a.konepsId}`} style={rowStyle}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={titleStyle}>{a.title}</div>
                      <div style={subStyle}>{a.orgName} · {fmtPrice(a.budget)}원</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: dday.color }}>{dday.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── 서브 컴포넌트 ───────────────────────────────────────────────────────────

function MetricBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>
        {value}
        {sub && <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 500, marginLeft: 3 }}>{sub}</span>}
      </div>
    </div>
  );
}

function BoxHeader({ icon, title, href, badge }: { icon: string; title: string; href: string; badge?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", whiteSpace: "nowrap" }}>{icon} {title}</span>
        {badge && (
          <span style={{ fontSize: 9, fontWeight: 700, background: "#EEF2FF", color: "#1B3A6B", padding: "2px 6px", borderRadius: 4 }}>
            {badge}
          </span>
        )}
      </div>
      <Link href={href} style={{ fontSize: 11, color: "#60A5FA", textDecoration: "none", whiteSpace: "nowrap" }}>
        전체 →
      </Link>
    </div>
  );
}

function Loading() {
  return <div style={{ padding: "16px", textAlign: "center", color: "#94A3B8", fontSize: 12 }}>불러오는 중...</div>;
}

function Empty({ msg, linkHref, linkText }: { msg: string; linkHref?: string; linkText?: string }) {
  return (
    <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "16px", textAlign: "center" }}>
      <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: linkHref ? 4 : 0 }}>{msg}</div>
      {linkHref && (
        <Link href={linkHref} style={{ fontSize: 11, color: "#1B3A6B", fontWeight: 600, textDecoration: "none" }}>
          {linkText} →
        </Link>
      )}
    </div>
  );
}

const listStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const rowStyle: React.CSSProperties = {
  background: "#F8FAFC", borderRadius: 8, border: "1px solid #E8ECF2",
  padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
  textDecoration: "none", color: "inherit",
};
const titleStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "#0F172A",
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
const subStyle: React.CSSProperties = {
  fontSize: 10, color: "#64748B", marginTop: 2,
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
