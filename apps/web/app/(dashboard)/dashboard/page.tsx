"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface DashboardStats {
  core1UsedThisMonth: number;
  core1Limit: number;
  eligibleAnnouncements: number;
  urgentAnnouncements: number;
  todayAnnouncements: number;
}

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  border: "1px solid #E8ECF2",
  padding: "18px 20px",
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const val = (key: keyof DashboardStats) =>
    loading ? "..." : stats ? String(stats[key]) : "-";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* 헤더 */}
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: 0 }}>대시보드</h2>
        <p style={{ fontSize: 13, color: "#64748B", marginTop: 4, marginBottom: 0 }}>
          오늘도 전략적으로 투찰하세요.
        </p>
      </div>

      {/* 지표 카드 4열 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {[
          {
            title: "이번 달 번호 추천",
            value: loading ? "..." : stats ? `${stats.core1UsedThisMonth} / ${stats.core1Limit === -1 ? "∞" : stats.core1Limit}` : "-",
            sub: "CORE 1 사용량",
            icon: "🎯",
            accent: true,
          },
          { title: "적격 가능 공고", value: val("eligibleAnnouncements"), sub: "내 업체 기준", icon: "✅", accent: false },
          { title: "마감 임박 공고", value: val("urgentAnnouncements"),   sub: "D-3 이내",     icon: "⏰", accent: false },
          { title: "오늘 신규 공고", value: val("todayAnnouncements"),     sub: "오늘 등록",    icon: "≡",  accent: false },
        ].map((card, idx) => (
          <div key={card.title} style={{
            ...cardStyle,
            borderTop: idx === 0 ? "3px solid #1B3A6B" : cardStyle.border,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 500 }}>{card.title}</span>
              <span style={{ fontSize: 18 }}>{card.icon}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#0F172A", lineHeight: 1 }}>{card.value}</div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* 번호 전략 퀵 액세스 */}
      <div style={cardStyle}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#0F172A" }}>번호 전략 분석</span>
            <span style={{ fontSize: 10, fontWeight: 700, background: "#EEF2FF", color: "#1B3A6B", padding: "2px 7px", borderRadius: 4 }}>CORE 1</span>
          </div>
          <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>
            지금 분석할 공고를 선택하거나 조건을 직접 입력하세요
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/announcements" style={{
            flex: 1, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
            background: "#1B3A6B", color: "#fff", borderRadius: 10, fontSize: 13, fontWeight: 600,
            textDecoration: "none",
          }}>
            📋 공고 선택하기
          </Link>
          <Link href="/strategy" style={{
            flex: 1, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
            background: "#F0F2F5", color: "#1B3A6B", borderRadius: 10, fontSize: 13, fontWeight: 600,
            textDecoration: "none", border: "1px solid #E8ECF2",
          }}>
            ✏️ 직접 조건 입력
          </Link>
        </div>
      </div>

      {/* 내 업체 적격심사 현황 */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>내 업체 적격심사 현황</span>
            <span style={{ fontSize: 10, fontWeight: 700, background: "#F0FDF4", color: "#166534", padding: "2px 7px", borderRadius: 4, marginLeft: 8 }}>CORE 3</span>
          </div>
          <Link href="/profile" style={{ fontSize: 12, color: "#60A5FA", textDecoration: "none" }}>업체 정보 설정 →</Link>
        </div>
        <div style={{
          background: "#F8FAFC",
          borderRadius: 10,
          border: "1px dashed #CBD5E1",
          padding: "24px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🏢</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
            업체 정보를 등록하면 적격심사 가능 공고를 자동으로 안내해드립니다
          </div>
          <Link href="/profile" style={{
            display: "inline-block", marginTop: 12, background: "#1B3A6B", color: "#fff",
            borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 600, textDecoration: "none",
          }}>
            업체 정보 등록하기
          </Link>
        </div>
      </div>

      {/* 마감 임박 공고 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>마감 임박 공고</span>
        <Link href="/announcements?sort=deadline" style={{ fontSize: 12, color: "#60A5FA", textDecoration: "none" }}>전체 보기 →</Link>
      </div>
      <div style={{
        background: "linear-gradient(135deg, #1B3A6B 0%, #0F1E3C 100%)",
        borderRadius: 14,
        padding: "20px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 4 }}>나라장터 최신 공고 확인하기</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>매일 자동 수집 · 번호 전략 바로 분석</div>
        </div>
        <Link href="/announcements" style={{
          background: "#fff", color: "#1B3A6B", borderRadius: 10,
          padding: "9px 18px", fontSize: 13, fontWeight: 600, textDecoration: "none", flexShrink: 0,
        }}>
          공고 보기 →
        </Link>
      </div>
    </div>
  );
}
