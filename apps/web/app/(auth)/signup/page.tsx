"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.bizNo.length !== 10) {
      setError("사업자번호 10자리를 입력해주세요.");
      return;
    }
    if (form.password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (form.password !== form.passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setLoading(true);

    // 1. 국세청 사업자 유효성 검증
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/verify-bizno", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bizNo: form.bizNo }),
      });
      const data = (await res.json()) as { valid: boolean; message?: string };
      if (!data.valid) {
        setError(data.message ?? "유효하지 않은 사업자번호입니다. 폐업·휴업 여부를 확인해주세요.");
        setLoading(false);
        setVerifying(false);
        return;
      }
    } catch {
      // API 호출 실패 시 가입 허용 (서비스 중단 방지)
      console.error("사업자 검증 API 호출 실패 — 가입 진행");
    }
    setVerifying(false);

    // 2. Supabase 회원가입
    const email = `${form.bizNo}@naktal.biz`;
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signUp({ email, password: form.password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // 3. User 테이블에 추가 정보 저장
    try {
      await fetch("/api/auth/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bizNo: form.bizNo,
          bizName: form.bizName,
          ownerName: form.ownerName,
          notifyEmail: form.notifyEmail || null,
          notifyPhone: form.notifyPhone || null,
        }),
      });
    } catch {
      console.error("User 프로필 저장 실패");
    }

    router.push("/dashboard");
    router.refresh();
  }

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] disabled:bg-gray-50";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="text-3xl font-bold text-[#1E3A5F] mb-2">NAKTAL</div>
          <CardTitle>회원가입</CardTitle>
          <CardDescription>나라장터 입찰 분석 플랫폼</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            {/* 사업자번호 */}
            <div className="space-y-1">
              <label className="text-sm font-medium">사업자번호 *</label>
              <BizNoInput value={form.bizNo} onChange={set("bizNo")} disabled={loading} />
            </div>

            {/* 상호명 */}
            <div className="space-y-1">
              <label className="text-sm font-medium">상호명 *</label>
              <input
                type="text" required value={form.bizName} disabled={loading}
                onChange={(e) => set("bizName")(e.target.value)}
                placeholder="(주)홍길동건설" className={inputClass}
              />
            </div>

            {/* 대표자명 */}
            <div className="space-y-1">
              <label className="text-sm font-medium">대표자명 *</label>
              <input
                type="text" required value={form.ownerName} disabled={loading}
                onChange={(e) => set("ownerName")(e.target.value)}
                placeholder="홍길동" className={inputClass}
              />
            </div>

            {/* 비밀번호 */}
            <div className="space-y-1">
              <label className="text-sm font-medium">비밀번호 *</label>
              <input
                type="password" required minLength={8} value={form.password} disabled={loading}
                onChange={(e) => set("password")(e.target.value)}
                placeholder="8자 이상" className={inputClass}
              />
            </div>

            {/* 비밀번호 확인 */}
            <div className="space-y-1">
              <label className="text-sm font-medium">비밀번호 확인 *</label>
              <input
                type="password" required value={form.passwordConfirm} disabled={loading}
                onChange={(e) => set("passwordConfirm")(e.target.value)}
                placeholder="비밀번호 재입력" className={inputClass}
              />
            </div>

            {/* 알림 이메일 (선택) */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-600">
                알림 이메일 <span className="text-gray-400">(선택)</span>
              </label>
              <input
                type="email" value={form.notifyEmail} disabled={loading}
                onChange={(e) => set("notifyEmail")(e.target.value)}
                placeholder="notify@company.com" className={inputClass}
              />
            </div>

            {/* 알림 전화번호 (선택) */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-600">
                알림 전화번호 <span className="text-gray-400">(선택)</span>
              </label>
              <input
                type="tel" value={form.notifyPhone} disabled={loading}
                onChange={(e) => set("notifyPhone")(e.target.value)}
                placeholder="010-0000-0000" className={inputClass}
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1E3A5F] hover:bg-[#162d4a]"
            >
              {verifying ? "사업자 검증 중..." : loading ? "가입 중..." : "회원가입"}
            </Button>
          </form>

          <p className="text-center text-sm text-gray-600 mt-4">
            이미 계정이 있으신가요?{" "}
            <Link href="/login" className="text-[#1E3A5F] font-medium hover:underline">
              로그인
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
