import Link from "next/link";
import { redirect } from "next/navigation";
import { verifyAdminSession } from "@/lib/admin-auth";
import { AdminLogoutButton } from "./AdminLogoutButton";

const adminNav = [
  { href: "/admin", label: "대시보드", icon: "📊" },
  { href: "/admin/users", label: "사용자 관리", icon: "👥" },
  { href: "/admin/payments", label: "결제 내역", icon: "💳" },
  { href: "/admin/crawl", label: "크롤링 관리", icon: "🕷️" },
  { href: "/admin/announcements", label: "공고 관리", icon: "📋" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) redirect("/admin-login");

  return (
    <div className="flex min-h-screen bg-[#0F172A] text-white">
      {/* 사이드바 */}
      <aside className="flex flex-col w-60 border-r border-white/10">
        <div className="flex items-center gap-2 h-16 px-5 border-b border-white/10">
          <span className="text-lg font-bold tracking-wider">NAKTAL</span>
          <span className="text-xs font-semibold bg-red-600 text-white px-2 py-0.5 rounded">
            ADMIN
          </span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1">
          {adminNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-white/10 space-y-2">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-xs text-white/50 hover:text-white transition-colors"
          >
            ← 일반 서비스로 돌아가기
          </Link>
          <AdminLogoutButton />
        </div>
      </aside>

      {/* 메인 */}
      <div className="flex-1 flex flex-col">
        {/* 상단 바 */}
        <header className="flex items-center h-14 px-6 border-b border-white/10 bg-red-900/20">
          <span className="text-sm font-semibold text-red-400">
            ⚠️ ADMIN MODE — 모든 조작은 AdminLog에 기록됩니다
          </span>
        </header>

        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
