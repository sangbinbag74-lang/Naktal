"use client";

import { useEffect } from "react";

/**
 * 배포 시 사용자 캐시 강제 클리어 (박상빈님 2026-05-20 명시).
 *  - 배포할 때마다 APP_VERSION 만 갱신 → 모든 사용자 브라우저 localStorage/sessionStorage 전부 클리어.
 *  - 옛 필터(naktal_ann_filters 등) 자동 복원으로 "연동 안 됨" 호소 방지.
 *  - 조건부 X — 버전 불일치 시 무조건 전부 밀어버림.
 */
const APP_VERSION = "2026-07-09-pricing-table"; // ⚠️ 배포마다 갱신

// ⚠️ 인증 세션은 절대 지우지 않는다 (2026-06-11 사고: clear()가 로그인 세션 삭제 → 로그아웃 튕김)
function isAuthKey(k: string): boolean {
  return k.startsWith("sb-") || k.includes("supabase") || k.includes("auth-token");
}

export function CacheGuard() {
  useEffect(() => {
    try {
      if (localStorage.getItem("naktal_app_version") !== APP_VERSION) {
        // 앱 캐시(옛 필터 등)만 제거 — Supabase 인증 키는 보존
        const removable: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k !== "naktal_app_version" && !isAuthKey(k)) removable.push(k);
        }
        removable.forEach((k) => localStorage.removeItem(k));
        localStorage.setItem("naktal_app_version", APP_VERSION);
        // sessionStorage 는 인증 토큰 보존을 위해 더 이상 전체 clear 하지 않음
      }
    } catch { /* 무시 */ }
  }, []);
  return null;
}
