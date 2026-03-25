"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { BizNoInput } from "@/components/ui/biz-no-input";

export default function LoginPage() {
  const router = useRouter();
  const [bizNo, setBizNo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 파트너 로그인 모달
  const [showPartner, setShowPartner] = useState(false);
  const [adminId, setAdminId] = useState("");
  const [adminPw, setAdminPw] = useState("");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (bizNo.length !== 10) {
      setError("사업자번호 10자리를 입력해주세요.");
      return;
    }
    setLoading(true);
    setError(null);

    const email = `biz_${bizNo}@naktal.biz`;
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError("사업자번호 또는 비밀번호가 올바르지 않습니다.");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!adminId || !adminPw) return;
    setAdminLoading(true);
    setAdminError(null);

    const res = await fetch("/api/auth/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: adminId, password: adminPw }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setAdminError(data.error ?? "로그인에 실패했습니다.");
      setAdminLoading(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#F7F8FA",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
    }}>
      <div style={{
        background: "#fff",
        borderRadius: 20,
        border: "1px solid #EAECF0",
        padding: "48px 44px",
        width: "100%",
        maxWidth: 420,
        boxShadow: "0 4px 24px rgba(15,30,60,0.06)",
      }}>
        {/* 로고 */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "inline-flex", alignItems: "baseline", gap: 2, marginBottom: 16 }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: "#1B3A6B" }}>NAKTAL</span>
            <span style={{ fontSize: 26, fontWeight: 700, color: "#60A5FA" }}>.AI</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>
            다시 만나서 반갑습니다
          </div>
          <div style={{ fontSize: 14, color: "#64748B" }}>
            사업자번호로 로그인하세요
          </div>
        </div>

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 6 }}>
              사업자번호
            </label>
            <BizNoInput value={bizNo} onChange={setBizNo} disabled={loading} />
          </div>

          <div>
            <label htmlFor="password" style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 6 }}>
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              className="naktal-input"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div style={{
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 13,
              color: "#DC2626",
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || bizNo.length !== 10}
            className="naktal-btn-primary"
            style={{ marginTop: 4 }}
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, fontSize: 13 }}>
          <Link href="/forgot-password" style={{ color: "#64748B" }}>
            비밀번호 찾기
          </Link>
          <Link href="/signup" style={{ color: "#1B3A6B", fontWeight: 600 }}>
            회원가입
          </Link>
        </div>

        {/* 보안 문구 + 파트너 로그인 */}
        <div style={{ marginTop: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 11, color: "#CBD5E1" }}>
            국세청 인증 기반 · 256bit SSL 암호화
          </div>
          <button
            onClick={() => { setShowPartner(true); setAdminError(null); setAdminId(""); setAdminPw(""); }}
            style={{
              fontSize: 11, color: "#CBD5E1", background: "none", border: "none",
              cursor: "pointer", padding: "2px 0", textDecoration: "underline",
            }}
          >
            파트너 로그인
          </button>
        </div>
      </div>

      {/* 파트너 로그인 모달 */}
      {showPartner && (
        <div
          onClick={() => setShowPartner(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000, padding: "24px 16px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#1E293B",
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.08)",
              padding: "40px 36px",
              width: "100%",
              maxWidth: 380,
              boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
            }}
          >
            {/* 헤더 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>NAKTAL</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, background: "#DC2626",
                  color: "#fff", padding: "2px 7px", borderRadius: 4,
                }}>ADMIN</span>
              </div>
              <button
                onClick={() => setShowPartner(false)}
                style={{
                  background: "none", border: "none", color: "rgba(255,255,255,0.4)",
                  fontSize: 20, cursor: "pointer", lineHeight: 1, padding: 4,
                }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleAdminLogin} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 5 }}>
                  아이디
                </label>
                <input
                  type="text"
                  value={adminId}
                  onChange={(e) => setAdminId(e.target.value)}
                  required
                  disabled={adminLoading}
                  autoComplete="username"
                  placeholder="관리자 아이디"
                  style={{
                    height: 44, width: "100%", background: "rgba(255,255,255,0.06)",
                    border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 10,
                    fontSize: 14, padding: "0 14px", color: "#fff", outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 5 }}>
                  비밀번호
                </label>
                <input
                  type="password"
                  value={adminPw}
                  onChange={(e) => setAdminPw(e.target.value)}
                  required
                  disabled={adminLoading}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  style={{
                    height: 44, width: "100%", background: "rgba(255,255,255,0.06)",
                    border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 10,
                    fontSize: 14, padding: "0 14px", color: "#fff", outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {adminError && (
                <div style={{
                  background: "rgba(220,38,38,0.15)",
                  border: "1px solid rgba(220,38,38,0.4)",
                  borderRadius: 8, padding: "9px 12px",
                  fontSize: 13, color: "#FCA5A5",
                }}>
                  {adminError}
                </div>
              )}

              <button
                type="submit"
                disabled={adminLoading || !adminId || !adminPw}
                style={{
                  height: 46, background: adminLoading ? "#374151" : "#DC2626",
                  color: "#fff", borderRadius: 10, fontSize: 14, fontWeight: 700,
                  border: "none", cursor: adminLoading ? "not-allowed" : "pointer",
                  marginTop: 4,
                }}
              >
                {adminLoading ? "로그인 중..." : "관리자 로그인"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
