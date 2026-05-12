import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileSidebar } from "@/components/layout/MobileSidebar";
import { Header } from "@/components/layout/Header";
import { fetchG2BCompanyInfo } from "@/lib/g2b-company";

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

  const rawBizName = dbUser?.bizName ?? "";
  const isTemplate = /^업체\(\d+\)$/.test(rawBizName) || rawBizName === "미등록" || rawBizName === "";

  let bizName = isTemplate ? "" : rawBizName;

  // 템플릿 값이면 G2B에서 실제 업체명 조회 후 DB 자동 갱신
  if (isTemplate) {
    const bizNoMatch = user.email?.match(/^biz_(\d{10})@naktal\.biz$/);
    const bizNo = bizNoMatch?.[1];
    if (bizNo) {
      try {
        const g2b = await fetchG2BCompanyInfo(bizNo);
        if (g2b?.bizName) {
          bizName = g2b.bizName;
          const admin = createAdminClient();
          admin.from("User").update({ bizName: g2b.bizName, ownerName: g2b.ceoName }).eq("supabaseId", user.id).then(() => {});
        }
      } catch { /* G2B 실패 무시 */ }
    }
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: "#F0F2F5" }}>
      {/* 데스크톱 사이드바 */}
      <div className="hidden md:flex" style={{ flexShrink: 0 }}>
        <Sidebar />
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
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{
              width: 24, height: 24, borderRadius: 5,
              background: "#1B3A6B", color: "#fff",
              display: "grid", placeItems: "center",
              fontWeight: 900, fontSize: 13, letterSpacing: "-0.04em",
            }}>낙</span>
            <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1.15 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: "#1B3A6B", letterSpacing: "-0.025em" }}>낙비</span>
              <span style={{ fontSize: 9, color: "#94A3B8", fontWeight: 500 }}>내 손안의 AI 낙찰비서</span>
            </span>
          </span>
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
