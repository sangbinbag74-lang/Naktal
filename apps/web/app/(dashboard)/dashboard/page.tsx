"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface DashboardStats {
  todayAnnouncements: number;
  monthAlerts: number;
  avgBidRate: string;
  weekBidResults: number;
}

const STAT_CONFIG = [
  {
    key: "todayAnnouncements" as const,
    title: "오늘 신규 공고",
    sub: "오늘 등록된 공고 수",
    icon: "≡",
    accent: true,
    unit: "건",
  },
  {
    key: "monthAlerts" as const,
    title: "이번 달 크롤링",
    sub: "수집된 데이터",
    icon: "↻",
    accent: false,
    unit: "건",
  },
  {
    key: "avgBidRate" as const,
    title: "평균 투찰률",
    sub: "전체 낙찰 평균",
    icon: "↗",
    accent: false,
    unit: "%",
  },
  {
    key: "weekBidResults" as const,
    title: "이번 주 낙찰",
    sub: "최근 7일 낙찰 건수",
    icon: "✓",
    accent: false,
    unit: "건",
  },
];

const QUICK_LINKS = [
  { href: "/announcements", label: "공고 목록 보기", desc: "최신 나라장터 공고", color: "#EEF2FF", tc: "#1B3A6B" },
  { href: "/ai-recommend", label: "AI 투찰 추천", desc: "최적 투찰률 분석", color: "#F0FDF4", tc: "#166534" },
  { href: "/preeprice", label: "복수예가 추천", desc: "번호 빈도 통계 분석", color: "#FFF7ED", tc: "#C2410C" },
  { href: "/analysis", label: "투찰 분석", desc: "업종별 낙찰 통계", color: "#F8FAFF", tc: "#1E40AF" },
];

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* 페이지 헤더 */}
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A" }}>대시보드</h2>
        <p style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>
          나라장터 입찰 현황을 한눈에 확인하세요.
        </p>
      </div>

      {/* 지표 카드 4열 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {STAT_CONFIG.map((card, idx) => {
          const raw = loading ? null : stats ? stats[card.key] : null;
          const value = loading ? "..." : raw != null ? String(raw) : "-";
          return (
            <div
              key={card.key}
              style={{
                background: "#fff",
                borderRadius: 14,
                border: "1px solid #F1F5F9",
                borderTop: idx === 0 ? "3px solid #1B3A6B" : "1px solid #F1F5F9",
                padding: "18px 20px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 500 }}>{card.title}</span>
                <span style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: "#F8FAFC",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, color: "#64748B",
                }}>
                  {card.icon}
                </span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#0F172A", lineHeight: 1 }}>
                {value}
                {raw != null && card.unit !== "%" && (
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#64748B", marginLeft: 4 }}>{card.unit}</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>{card.sub}</div>
            </div>
          );
        })}
      </div>

      {/* 빠른 이동 */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 12 }}>빠른 이동</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                background: link.color,
                borderRadius: 12,
                border: "1px solid #E8ECF2",
                padding: "16px 18px",
                textDecoration: "none",
                transition: "transform 0.15s ease, box-shadow 0.15s ease",
                display: "block",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-2px)";
                (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)";
                (e.currentTarget as HTMLAnchorElement).style.boxShadow = "none";
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: link.tc, marginBottom: 4 }}>{link.label}</div>
              <div style={{ fontSize: 12, color: "#64748B" }}>{link.desc}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* 공고 목록 바로가기 CTA */}
      <div style={{
        background: "linear-gradient(135deg, #1B3A6B 0%, #0F1E3C 100%)",
        borderRadius: 14,
        padding: "24px 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
            오늘 새로 올라온 공고를 확인하세요
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
            나라장터 최신 공고 · AI 분석 포함
          </div>
        </div>
        <Link
          href="/announcements"
          style={{
            background: "#fff",
            color: "#1B3A6B",
            borderRadius: 10,
            padding: "10px 20px",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
            flexShrink: 0,
          }}
        >
          공고 보기 →
        </Link>
      </div>
    </div>
  );
}
