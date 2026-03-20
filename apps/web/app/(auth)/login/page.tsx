"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

    // 사업자번호 → @naktal.biz 이메일로 변환
    const email = `${bizNo}@naktal.biz`;
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="text-3xl font-bold text-[#1E3A5F] mb-2">NAKTAL</div>
          <CardTitle>로그인</CardTitle>
          <CardDescription>나라장터 입찰 분석 플랫폼</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">사업자번호</label>
              <BizNoInput
                value={bizNo}
                onChange={setBizNo}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button
              type="submit"
              disabled={loading || bizNo.length !== 10}
              className="w-full bg-[#1E3A5F] hover:bg-[#162d4a]"
            >
              {loading ? "로그인 중..." : "로그인"}
            </Button>
          </form>

          <div className="flex items-center justify-between text-sm">
            <Link href="/forgot-password" className="text-gray-500 hover:underline">
              비밀번호 찾기
            </Link>
            <Link href="/signup" className="text-[#1E3A5F] font-medium hover:underline">
              회원가입
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
