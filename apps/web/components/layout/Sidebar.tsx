"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import type { Plan } from "@naktal/types";

interface SidebarProps {
  plan?: Plan;
}

const menuItems = [
  { href: "/dashboard", label: "대시보드", icon: "📊" },
  { href: "/announcements", label: "공고 목록", icon: "📋" },
  { href: "/analysis", label: "투찰 분석", icon: "🔍" },
  { href: "/ai-recommend", label: "AI 투찰 추천", icon: "🤖" },
  { href: "/preeprice", label: "복수예가", icon: "🎯" },
  { href: "/alerts", label: "알림 설정", icon: "🔔" },
  { href: "/pricing", label: "요금제", icon: "💳" },
  { href: "/settings", label: "설정", icon: "⚙️" },
];

const planLabels: Record<Plan, string> = {
  FREE: "무료",
  STANDARD: "스탠다드",
  PRO: "프로",
};

const planVariants: Record<Plan, "secondary" | "default" | "destructive"> = {
  FREE: "secondary",
  STANDARD: "default",
  PRO: "destructive",
};

export function Sidebar({ plan = "FREE" }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-[#1E3A5F] text-white">
      {/* 로고 */}
      <div className="flex items-center h-16 px-6 border-b border-[#2d4f7a]">
        <Link href="/dashboard" className="text-2xl font-bold tracking-wider">
          NAKTAL
        </Link>
      </div>

      {/* 메뉴 */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-white/20 text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 플랜 뱃지 */}
      <div className="px-6 py-4 border-t border-[#2d4f7a]">
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/60">현재 플랜</span>
          <Badge variant={planVariants[plan]} className="text-xs">
            {planLabels[plan]}
          </Badge>
        </div>
      </div>
    </aside>
  );
}
