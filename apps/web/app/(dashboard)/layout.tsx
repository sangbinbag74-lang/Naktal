import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileSidebar } from "@/components/layout/MobileSidebar";
import { Header } from "@/components/layout/Header";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // DB에서 회사명·플랜 조회
  const { data: dbUser } = await supabase
    .from("User")
    .select("bizName, plan")
    .eq("supabaseId", user.id)
    .single();

  const bizName = dbUser?.bizName ?? "";
  const plan = (dbUser?.plan ?? "FREE") as "FREE" | "STANDARD" | "PRO";

  return (
    <div style={{ display: "flex", height: "100vh", background: "#F0F2F5" }}>
      {/* 데스크톱 사이드바 */}
      <div className="hidden md:flex" style={{ flexShrink: 0 }}>
        <Sidebar plan={plan} />
      </div>

      {/* 메인 콘텐츠 영역 */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
        {/* 모바일 상단바 */}
        <div className="flex md:hidden" style={{
          height: 56,
          background: "#fff",
          borderBottom: "1px solid #F1F5F9",
          alignItems: "center",
          padding: "0 16px",
          gap: 12,
          flexShrink: 0,
        }}>
          <MobileSidebar />
          <span style={{ fontSize: 16, fontWeight: 700, color: "#1B3A6B" }}>NAKTAL.AI</span>
        </div>

        {/* 데스크톱 헤더 */}
        <div className="hidden md:block" style={{ flexShrink: 0 }}>
          <Header bizName={bizName} />
        </div>

        {/* 페이지 콘텐츠 */}
        <main style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
