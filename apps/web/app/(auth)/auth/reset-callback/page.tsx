"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) {
      router.replace("/login");
      return;
    }

    const params = new URLSearchParams(hash.slice(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type = params.get("type");

    if (!accessToken || !refreshToken) {
      router.replace("/login");
      return;
    }

    const supabase = createClient();
    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(() => {
      if (type === "recovery") {
        router.replace("/auth/reset-password");
      } else {
        router.replace("/dashboard");
      }
    });
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-500">인증 처리 중...</p>
    </div>
  );
}
