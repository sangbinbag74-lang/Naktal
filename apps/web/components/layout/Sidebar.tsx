"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarProps {
  isAdmin?: boolean;
}

const MENU_SECTIONS = [
  {
    label: "핵심 기능",
    items: [
      { href: "/announcements", label: "공고 목록", icon: "≡" },
      { href: "/qualification", label: "적격심사 계산기", icon: "🧮" },
      { href: "/realtime", label: "실시간 모니터", icon: "📡" },
    ],
  },
  {
    label: "내 활동",
    items: [
      { href: "/history",  label: "열람 이력",  icon: "🎯" },
      { href: "/folder",   label: "찜 목록",    icon: "⭐" },
      { href: "/contracts", label: "투찰 추적", icon: "📌" },
      { href: "/alerts",   label: "알림 설정",  icon: "◌" },
    ],
  },
  {
    label: "계정",
    items: [
      { href: "/profile",  label: "내 업체 정보", icon: "🏢" },
      { href: "/billing",  label: "요금제",       icon: "💳" },
      { href: "/settings", label: "설정",         icon: "⚙" },
    ],
  },
  {
    label: "어드민",
    items: [
      { href: "/admin/model",          label: "대시보드",   icon: "🏠", adminOnly: true },
      { href: "/admin/users",          label: "회원 관리",  icon: "👥", adminOnly: true },
      { href: "/admin/announcements",  label: "공고 관리",  icon: "📋", adminOnly: true },
      { href: "/admin/requests",       label: "투찰 의뢰",  icon: "📬", adminOnly: true },
      { href: "/admin/outcomes",       label: "낙찰 결과",  icon: "📈", adminOnly: true },
      { href: "/admin/predictions",    label: "예측 vs 결과", icon: "🔮", adminOnly: true },
      { href: "/admin/accuracy",       label: "AI 적중률",  icon: "🎯", adminOnly: true },
    ],
  },
];

export function Sidebar({ isAdmin = false }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside style={{ width: 220, minHeight: "100vh", background: "#0F1E3C", display: "flex", flexDirection: "column" }}>
      {/* 로고 */}
      <div style={{ height: 56, display: "flex", alignItems: "center", padding: "0 20px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "#fff" }}>
          <span style={{
            width: 26, height: 26, borderRadius: 6,
            background: "#fff", color: "#1B3A6B",
            display: "grid", placeItems: "center",
            fontWeight: 900, fontSize: 14, letterSpacing: "-0.04em",
            flexShrink: 0,
          }}>낙</span>
          <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1.15 }}>
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.025em" }}>낙비</span>
            <span style={{ fontSize: 9.5, color: "#94A3B8", marginTop: 1, fontWeight: 500 }}>
              내 손안의 AI 낙찰비서
            </span>
          </span>
        </Link>
      </div>

      {/* 퀵 배너 */}
      <Link href="/announcements" style={{
        margin: "10px 10px 0",
        background: "linear-gradient(135deg, #1B3A6B 0%, #1E4080 100%)",
        borderRadius: 10,
        padding: "10px 12px",
        textDecoration: "none",
        border: "1px solid rgba(96,165,250,0.25)",
        display: "block",
      }}>
        <div style={{ fontSize: 10, color: "#60A5FA", fontWeight: 600, marginBottom: 2 }}>공고 → 번호 분석</div>
        <div style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>오늘 공고에서 번호 분석하기 →</div>
      </Link>

      {/* 메뉴 */}
      <nav style={{ flex: 1, padding: "12px 10px", overflowY: "auto" }}>
        {MENU_SECTIONS.filter((section) => section.label !== "어드민" || isAdmin).map((section) => (
          <div key={section.label} style={{ marginBottom: 18 }}>
            <div style={{
              fontSize: 10,
              fontWeight: 600,
              color: "#475569",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              padding: "0 8px",
              marginBottom: 4,
            }}>
              {section.label}
            </div>
            {section.items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    padding: "9px 10px",
                    borderRadius: 8,
                    fontSize: 13.5,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "#fff" : "#94A3B8",
                    background: isActive ? "#1B3A6B" : "transparent",
                    transition: "all 0.15s ease",
                    marginBottom: 2,
                    textDecoration: "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.06)";
                      (e.currentTarget as HTMLAnchorElement).style.color = "#fff";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
                      (e.currentTarget as HTMLAnchorElement).style.color = "#94A3B8";
                    }
                  }}
                >
                  <span style={{ fontSize: 14, width: 18, textAlign: "center" }}>{item.icon as string}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

    </aside>
  );
}
