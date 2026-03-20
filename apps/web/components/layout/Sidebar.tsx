"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Plan } from "@naktal/types";

interface SidebarProps {
  plan?: Plan;
}

const MENU_SECTIONS = [
  {
    label: "메인",
    items: [
      { href: "/dashboard", label: "대시보드", icon: "⊞" },
      { href: "/announcements", label: "공고 목록", icon: "≡" },
    ],
  },
  {
    label: "분석",
    items: [
      { href: "/analysis", label: "투찰 분석", icon: "↗" },
      { href: "/ai-recommend", label: "AI 투찰 추천", icon: "✦" },
      { href: "/preeprice", label: "복수예가", icon: "◈" },
    ],
  },
  {
    label: "관리",
    items: [
      { href: "/alerts", label: "알림 설정", icon: "◌" },
      { href: "/pricing", label: "요금제", icon: "◇" },
      { href: "/settings", label: "설정", icon: "⚙" },
    ],
  },
];

const planLabels: Record<Plan, string> = {
  FREE: "무료",
  STANDARD: "스탠다드",
  PRO: "프로",
};

const planColors: Record<Plan, string> = {
  FREE: "#475569",
  STANDARD: "#1B3A6B",
  PRO: "#059669",
};

export function Sidebar({ plan = "FREE" }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      style={{ width: 220, minHeight: "100vh", background: "#0F1E3C", display: "flex", flexDirection: "column" }}
    >
      {/* 로고 */}
      <div style={{ height: 56, display: "flex", alignItems: "center", padding: "0 20px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <Link href="/dashboard" style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#fff", letterSpacing: "0.05em" }}>NAKTAL</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#60A5FA" }}>.AI</span>
        </Link>
      </div>

      {/* 메뉴 */}
      <nav style={{ flex: 1, padding: "16px 12px", overflowY: "auto" }}>
        {MENU_SECTIONS.map((section) => (
          <div key={section.label} style={{ marginBottom: 20 }}>
            <div style={{
              fontSize: 10,
              fontWeight: 600,
              color: "#475569",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              padding: "0 10px",
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
                    gap: 10,
                    padding: "9px 10px",
                    borderRadius: 8,
                    fontSize: 13.5,
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? "#fff" : "#94A3B8",
                    background: isActive ? "#1B3A6B" : "transparent",
                    transition: "all 0.15s ease",
                    marginBottom: 2,
                    textDecoration: "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLAnchorElement).style.background = "#1E3A6B";
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
                  <span style={{ fontSize: 14, width: 18, textAlign: "center", opacity: isActive ? 1 : 0.7 }}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* 하단 플랜 뱃지 */}
      <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
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
            <Link
              href="/pricing"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#60A5FA",
                textDecoration: "none",
                background: "rgba(96,165,250,0.12)",
                padding: "4px 8px",
                borderRadius: 6,
              }}
            >
              업그레이드
            </Link>
          )}
          {plan === "PRO" && (
            <span style={{ fontSize: 11, color: planColors[plan], fontWeight: 600 }}>PRO</span>
          )}
        </div>
      </div>
    </aside>
  );
}
