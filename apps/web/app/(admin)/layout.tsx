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
    <div className="flex min-h-screen" style={{ background: "#F0F2F5" }}>
      {/* 사이드바 */}
      <aside className="flex flex-col w-56 shrink-0" style={{ background: "#0F1E3C" }}>
        <div className="flex items-center gap-2 h-14 px-4 border-b border-white/10">
          <span className="text-base font-bold tracking-wider text-white">NAKTAL</span>
          <span className="text-xs font-bold bg-red-600 text-white px-1.5 py-0.5 rounded">ADMIN</span>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {adminNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-white/10 space-y-2">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors"
          >
            ← 서비스로 돌아가기
          </Link>
          <AdminLogoutButton />
        </div>
      </aside>

      {/* 메인 */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center h-10 px-6" style={{ background: "#FFF1F1", borderBottom: "1px solid #FECACA" }}>
          <span className="text-xs font-medium text-red-600">
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
