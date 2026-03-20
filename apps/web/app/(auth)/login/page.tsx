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

        {/* 보안 문구 */}
        <div style={{
          marginTop: 28,
          paddingTop: 16,
          borderTop: "1px solid #F1F5F9",
          textAlign: "center",
          fontSize: 11,
          color: "#CBD5E1",
        }}>
          국세청 인증 기반 · 256bit SSL 암호화
        </div>
      </div>
    </div>
  );
}
