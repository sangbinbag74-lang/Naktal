"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface HeaderProps {
  title: string;
  email?: string;
}

export function Header({ title, email }: HeaderProps) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initial = email ? email.charAt(0).toUpperCase() : "U";

  return (
    <header style={{
      height: 56,
      background: "#fff",
      borderBottom: "1px solid #F1F5F9",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 24px",
      position: "sticky",
      top: 0,
      zIndex: 10,
    }}>
      <h1 style={{ fontSize: 16, fontWeight: 600, color: "#0F172A" }}>{title}</h1>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {email && (
          <span style={{ fontSize: 13, color: "#64748B" }} className="hidden sm:block">
            {email.replace("@naktal.biz", "")}
          </span>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={handleLogout}
            style={{
              fontSize: 13,
              color: "#64748B",
              background: "none",
              border: "1px solid #E8ECF2",
              borderRadius: 8,
              padding: "5px 12px",
              cursor: "pointer",
              transition: "all 0.15s ease",
              height: 32,
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

          {/* 아바타 */}
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
      </div>
    </header>
  );
}
