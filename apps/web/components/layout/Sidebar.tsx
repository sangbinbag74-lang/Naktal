"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Plan } from "@naktal/types";

interface SidebarProps {
  plan?: Plan;
  isAdmin?: boolean;
}

const MENU_SECTIONS = [
  {
    label: "핵심 기능",
    items: [
      { href: "/announcements", label: "공고 목록", icon: "≡" },
    ],
  },
  {
    label: "내 활동",
    items: [
      { href: "/history",  label: "열람 이력",  icon: "🎯" },
      { href: "/folder",   label: "서류함",     icon: "📂" },
      { href: "/contracts", label: "계약 서류", icon: "📄" },
      { href: "/alerts",   label: "알림 설정",  icon: "◌" },
    ],
  },
  {
    label: "계정",
    items: [
      { href: "/profile",  label: "내 업체 정보", icon: "🏢" },
      { href: "/pricing",  label: "요금제",       icon: "◇" },
      { href: "/settings", label: "설정",         icon: "⚙" },
    ],
  },
  {
    label: "어드민",
    items: [
      { href: "/admin/model",          label: "운영 현황",  icon: "📊", adminOnly: true },
      { href: "/admin/outcomes",       label: "투찰 현황",  icon: "🗂", adminOnly: true },
      { href: "/admin/users",          label: "회원 관리",  icon: "👥", adminOnly: true },
      { href: "/admin/payments",       label: "결제 내역",  icon: "💳", adminOnly: true },
      { href: "/admin/announcements",  label: "공고 관리",  icon: "📋", adminOnly: true },
      { href: "/admin/crawl",          label: "크롤링",     icon: "🕷", adminOnly: true },
      { href: "/admin/beta",           label: "베타 신청",  icon: "🎟", adminOnly: true },
    ],
  },
];

const planLabels: Record<Plan, string> = {
  FREE: "무료",
  STANDARD: "프로",
  PRO: "프로",
};

export function Sidebar({ plan = "FREE", isAdmin = false }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside style={{ width: 220, minHeight: "100vh", background: "#0F1E3C", display: "flex", flexDirection: "column" }}>
      {/* 로고 */}
      <div style={{ height: 56, display: "flex", alignItems: "center", padding: "0 20px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <Link href="/dashboard" style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#fff", letterSpacing: "0.05em" }}>NAKTAL</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#60A5FA" }}>.AI</span>
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

      {/* 플랜 뱃지 */}
      <div style={{ padding: "12px 10px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{
          background: "#1B3A6B",
          borderRadius: 10,
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 2 }}>현재 플랜</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{planLabels[plan]}</div>
          </div>
          {plan !== "PRO" && (
            <Link href="/pricing" style={{
              fontSize: 11, fontWeight: 600, color: "#60A5FA",
              textDecoration: "none", background: "rgba(96,165,250,0.12)",
              padding: "4px 8px", borderRadius: 6,
            }}>
              업그레이드
            </Link>
          )}
          {plan === "PRO" && (
            <span style={{ fontSize: 11, color: "#059669", fontWeight: 700 }}>PRO ✓</span>
          )}
        </div>
      </div>
    </aside>
  );
}
