"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface HeaderProps {
  bizName?: string;
}

export function Header({ bizName }: HeaderProps) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initial = bizName ? bizName.charAt(0) : "N";

  return (
    <header style={{
      height: 56,
      background: "#fff",
      borderBottom: "1px solid #F1F5F9",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 28px",
      position: "sticky",
      top: 0,
      zIndex: 10,
    }}>
      {/* 좌: 빈 공간 (페이지별 타이틀은 각 page.tsx에서 렌더) */}
      <div />

      {/* 우: 회사명 + 로그아웃 + 아바타 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {bizName && (
          <span style={{ fontSize: 13, color: "#64748B", fontWeight: 500 }}>
            {bizName}
          </span>
        )}

        <button
          onClick={handleLogout}
          style={{
            fontSize: 13,
            color: "#64748B",
            background: "none",
            border: "1px solid #E8ECF2",
            borderRadius: 8,
            padding: "0 12px",
            cursor: "pointer",
            height: 32,
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#1B3A6B";
            (e.currentTarget as HTMLButtonElement).style.color = "#1B3A6B";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#E8ECF2";
            (e.currentTarget as HTMLButtonElement).style.color = "#64748B";
          }}
        >
          로그아웃
        </button>

        <div style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "#1B3A6B",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 600,
          flexShrink: 0,
        }}>
          {initial}
        </div>
      </div>
    </header>
  );
}
