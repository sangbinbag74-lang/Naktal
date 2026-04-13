"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BizNoInput } from "@/components/ui/biz-no-input";

export default function ForgotPasswordPage() {
  const [bizNo, setBizNo] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (bizNo.length !== 10) {
      setError("사업자번호 10자리를 입력해주세요.");
      return;
    }
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bizNo }),
    });
    const json = await res.json();

    if (!res.ok) {
      setError(json.error ?? "메일 발송에 실패했습니다.");
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="text-3xl font-bold text-[#1E3A5F] mb-2">NAKTAL</div>
            <CardTitle>메일 발송 완료</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-gray-600">
              비밀번호 재설정 링크를 이메일로 발송했습니다.
              <br />메일함을 확인해주세요.
            </p>
            <Link href="/login">
              <Button variant="outline" className="w-full">로그인으로 돌아가기</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="text-3xl font-bold text-[#1E3A5F] mb-2">NAKTAL</div>
          <CardTitle>비밀번호 찾기</CardTitle>
          <CardDescription>사업자번호를 입력하면 등록된 이메일로 재설정 링크를 보내드립니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">사업자번호</label>
              <BizNoInput value={bizNo} onChange={setBizNo} disabled={loading} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button
              type="submit"
              disabled={loading || bizNo.length !== 10}
              className="w-full bg-[#1E3A5F] hover:bg-[#162d4a]"
            >
              {loading ? "발송 중..." : "재설정 메일 보내기"}
            </Button>
          </form>
          <p className="text-center text-sm text-gray-600 mt-4">
            <Link href="/login" className="text-[#1E3A5F] hover:underline">
              로그인으로 돌아가기
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
