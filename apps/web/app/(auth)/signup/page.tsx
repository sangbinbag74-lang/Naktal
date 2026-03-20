"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { BizNoInput } from "@/components/ui/biz-no-input";

interface FormState {
  bizNo: string;
  bizName: string;
  ownerName: string;
  password: string;
  passwordConfirm: string;
  notifyEmail: string;
  notifyPhone: string;
}

const LabelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: "#374151",
  display: "block",
  marginBottom: 6,
};

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    bizNo: "", bizName: "", ownerName: "",
    password: "", passwordConfirm: "",
    notifyEmail: "", notifyPhone: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  function set(key: keyof FormState) {
    return (value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  }
  function setE(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.bizNo.length !== 10) { setError("사업자번호 10자리를 입력해주세요."); return; }
    if (form.password.length < 8) { setError("비밀번호는 8자 이상이어야 합니다."); return; }
    if (form.password !== form.passwordConfirm) { setError("비밀번호가 일치하지 않습니다."); return; }

    setLoading(true);
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/verify-bizno", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bizNo: form.bizNo }),
      });
      const data = (await res.json()) as { valid: boolean; message?: string };
      if (!data.valid) {
        setError(data.message ?? "유효하지 않은 사업자번호입니다.");
        setLoading(false);
        setVerifying(false);
        return;
      }
    } catch {
      console.error("사업자 검증 API 호출 실패 — 가입 진행");
    }
    setVerifying(false);

    const email = `${form.bizNo}@naktal.biz`;
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signUp({ email, password: form.password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    try {
      await fetch("/api/auth/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bizNo: form.bizNo, bizName: form.bizName, ownerName: form.ownerName,
          notifyEmail: form.notifyEmail || null, notifyPhone: form.notifyPhone || null,
        }),
      });
    } catch { console.error("User 프로필 저장 실패"); }

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
        padding: "40px 44px",
        width: "100%",
        maxWidth: 440,
        boxShadow: "0 4px 24px rgba(15,30,60,0.06)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "inline-flex", alignItems: "baseline", gap: 2, marginBottom: 12 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: "#1B3A6B" }}>NAKTAL</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: "#60A5FA" }}>.AI</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>회원가입</div>
          <div style={{ fontSize: 13, color: "#64748B" }}>나라장터 입찰 분석 플랫폼</div>
        </div>

        <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={LabelStyle}>사업자번호 <span style={{ color: "#DC2626" }}>*</span></label>
            <BizNoInput value={form.bizNo} onChange={set("bizNo")} disabled={loading} />
          </div>
          <div>
            <label style={LabelStyle}>상호명 <span style={{ color: "#DC2626" }}>*</span></label>
            <input type="text" required value={form.bizName} disabled={loading}
              onChange={setE("bizName")} placeholder="(주)홍길동건설" className="naktal-input" />
          </div>
          <div>
            <label style={LabelStyle}>대표자명 <span style={{ color: "#DC2626" }}>*</span></label>
            <input type="text" required value={form.ownerName} disabled={loading}
              onChange={setE("ownerName")} placeholder="홍길동" className="naktal-input" />
          </div>
          <div>
            <label style={LabelStyle}>비밀번호 <span style={{ color: "#DC2626" }}>*</span></label>
            <input type="password" required minLength={8} value={form.password} disabled={loading}
              onChange={setE("password")} placeholder="8자 이상" className="naktal-input" />
          </div>
          <div>
            <label style={LabelStyle}>비밀번호 확인 <span style={{ color: "#DC2626" }}>*</span></label>
            <input type="password" required value={form.passwordConfirm} disabled={loading}
              onChange={setE("passwordConfirm")} placeholder="비밀번호 재입력" className="naktal-input" />
          </div>
          <div>
            <label style={{ ...LabelStyle, color: "#64748B" }}>알림 이메일 <span style={{ color: "#94A3B8", fontWeight: 400 }}>(선택)</span></label>
            <input type="email" value={form.notifyEmail} disabled={loading}
              onChange={setE("notifyEmail")} placeholder="notify@company.com" className="naktal-input" />
          </div>
          <div>
            <label style={{ ...LabelStyle, color: "#64748B" }}>알림 전화번호 <span style={{ color: "#94A3B8", fontWeight: 400 }}>(선택)</span></label>
            <input type="tel" value={form.notifyPhone} disabled={loading}
              onChange={setE("notifyPhone")} placeholder="010-0000-0000" className="naktal-input" />
          </div>

          {error && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#DC2626" }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="naktal-btn-primary" style={{ marginTop: 4 }}>
            {verifying ? "사업자 검증 중..." : loading ? "가입 중..." : "회원가입"}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: 13, color: "#64748B", marginTop: 16 }}>
          이미 계정이 있으신가요?{" "}
          <Link href="/login" style={{ color: "#1B3A6B", fontWeight: 600 }}>로그인</Link>
        </p>
      </div>
    </div>
  );
}
