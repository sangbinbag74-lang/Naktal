"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

export default function KakaoCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const code = params.get("code");
    const errParam = params.get("error");

    if (errParam) {
      router.replace(`/signup?error=${encodeURIComponent("카카오 인증이 취소되었거나 실패했습니다.")}`);
      return;
    }
    if (!code) {
      router.replace(`/signup?error=${encodeURIComponent("카카오 인증 코드 누락")}`);
      return;
    }

    fetch("/api/auth/kakao-exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        redirectUri: `${window.location.origin}/auth/kakao/callback`,
      }),
    })
      .then(async (res) => {
        const data = (await res.json()) as {
          ok: boolean;
          error?: string;
          kakaoId?: string;
          name?: string;
          phone?: string | null;
          email?: string | null;
        };
        if (!data.ok) {
          router.replace(`/signup?error=${encodeURIComponent(data.error ?? "토큰 교환 실패")}`);
          return;
        }
        sessionStorage.setItem(
          "kakao_verified",
          JSON.stringify({
            kakaoId: data.kakaoId,
            name: data.name,
            phone: data.phone,
            email: data.email,
          })
        );
        router.replace("/signup");
      })
      .catch(() => {
        router.replace(`/signup?error=${encodeURIComponent("카카오 인증 처리 중 오류 발생")}`);
      });
  }, [params, router]);

  return (
    <div style={{
      minHeight: "100vh", background: "#F7F8FA",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 14, color: "#64748B",
    }}>
      카카오 인증 처리 중...
    </div>
  );
}
