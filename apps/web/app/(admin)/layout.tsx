import Link from "next/link";
import { redirect } from "next/navigation";
import { verifyAdminSession } from "@/lib/admin-auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { AdminLogoutButton } from "./AdminLogoutButton";

const adminNav = [
  { href: "/admin/model",         label: "운영 현황",  icon: "📊" },
  { href: "/admin/outcomes",      label: "투찰 현황",  icon: "🗂️" },
  { href: "/admin/users",         label: "회원 관리",  icon: "👥" },
  { href: "/admin/payments",      label: "결제 내역",  icon: "💳" },
  { href: "/admin/announcements", label: "공고 관리",  icon: "📋" },
  { href: "/admin/accuracy",      label: "정확도 분석", icon: "🎯" },
  { href: "/admin/beta",          label: "베타 신청",  icon: "🎟️" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. HMAC 쿠키 검증
  const cookieOk = await verifyAdminSession();

  // 2. Supabase isAdmin=true 검증
  let supabaseAdminOk = false;
  if (!cookieOk) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const admin = createAdminClient();
        const { data: dbUser } = await admin
          .from("User")
          .select("isAdmin")
          .eq("supabaseId", user.id)
          .single();
        supabaseAdminOk = !!dbUser?.isAdmin;
      }
    } catch { /* 세션 없음 */ }
  }

  if (!cookieOk && !supabaseAdminOk) redirect("/admin-login");

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#F0F2F5" }}>
      {/* 사이드바 */}
      <aside style={{
        width: 220, flexShrink: 0,
        background: "#0F1E3C",
        display: "flex", flexDirection: "column",
      }}>
        {/* 로고 */}
        <div style={{
          height: 56, padding: "0 16px",
          display: "flex", alignItems: "center", gap: 8,
          borderBottom: "1px solid rgba(255,255,255,0.1)",
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", letterSpacing: "0.05em" }}>NAKTAL</span>
          <span style={{
            fontSize: 10, fontWeight: 700, background: "#DC2626",
            color: "#fff", padding: "2px 6px", borderRadius: 4,
          }}>ADMIN</span>
        </div>

        {/* 네비게이션 */}
        <nav style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
          {adminNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 8,
                fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.7)",
                textDecoration: "none",
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* 하단 */}
        <div style={{
          padding: "12px 16px 16px",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <Link
            href="/dashboard"
            style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", textDecoration: "none" }}
          >
            ← 서비스로 돌아가기
          </Link>
          <AdminLogoutButton />
        </div>
      </aside>

      {/* 메인 영역 */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* 경고 바 */}
        <div style={{
          height: 40, padding: "0 24px",
          display: "flex", alignItems: "center",
          background: "#FFF1F1",
          borderBottom: "1px solid #FECACA",
          fontSize: 12, fontWeight: 500, color: "#DC2626",
          flexShrink: 0,
        }}>
          ⚠️ ADMIN MODE — 모든 조작은 AdminLog에 기록됩니다
        </div>

        {/* 콘텐츠 */}
        <main style={{ flex: 1, padding: 24, overflow: "auto" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
