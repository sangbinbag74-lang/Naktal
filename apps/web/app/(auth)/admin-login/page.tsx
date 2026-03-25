"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminLoginPage() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !password) return;
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setError(data.error ?? "로그인에 실패했습니다.");
      setLoading(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0F172A",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
    }}>
      <div style={{
        background: "#1E293B",
        borderRadius: 20,
        border: "1px solid rgba(255,255,255,0.08)",
        padding: "48px 44px",
        width: "100%",
        maxWidth: 400,
        boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
      }}>
        {/* 헤더 */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "0.05em" }}>NAKTAL</span>
            <span style={{
              fontSize: 11, fontWeight: 700, background: "#DC2626",
              color: "#fff", padding: "2px 8px", borderRadius: 4, letterSpacing: "0.05em",
            }}>ADMIN</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
            관리자 로그인
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
            파트너 전용 · 무단 접근 금지
          </div>
        </div>

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.6)", display: "block", marginBottom: 6 }}>
              아이디
            </label>
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              required
              disabled={loading}
              autoComplete="username"
              placeholder="관리자 아이디"
              style={{
                height: 48, width: "100%", background: "rgba(255,255,255,0.06)",
                border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 10,
                fontSize: 14, padding: "0 14px", color: "#fff", outline: "none",
                boxSizing: "border-box",
              }}
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#60A5FA"; }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.12)"; }}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.6)", display: "block", marginBottom: 6 }}>
              비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              autoComplete="current-password"
              placeholder="••••••••"
              style={{
                height: 48, width: "100%", background: "rgba(255,255,255,0.06)",
                border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 10,
                fontSize: 14, padding: "0 14px", color: "#fff", outline: "none",
                boxSizing: "border-box",
              }}
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#60A5FA"; }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.12)"; }}
            />
          </div>

          {error && (
            <div style={{
              background: "rgba(220,38,38,0.15)",
              border: "1px solid rgba(220,38,38,0.4)",
              borderRadius: 8, padding: "10px 12px",
              fontSize: 13, color: "#FCA5A5",
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !id || !password}
            style={{
              height: 50, background: loading ? "#374151" : "#DC2626",
              color: "#fff", borderRadius: 10, fontSize: 14, fontWeight: 700,
              border: "none", cursor: loading ? "not-allowed" : "pointer",
              marginTop: 4, transition: "background 0.15s",
            }}
          >
            {loading ? "로그인 중..." : "관리자 로그인"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 24 }}>
          <Link href="/login" style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textDecoration: "none" }}>
            ← 일반 로그인으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
