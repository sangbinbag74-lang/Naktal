"use client";

import { useEffect } from "react";

/**
 * 배포 시 사용자 캐시 강제 클리어 (박상빈님 2026-05-20 명시).
 *  - 배포할 때마다 APP_VERSION 만 갱신 → 모든 사용자 브라우저 localStorage/sessionStorage 전부 클리어.
 *  - 옛 필터(naktal_ann_filters 등) 자동 복원으로 "연동 안 됨" 호소 방지.
 *  - 조건부 X — 버전 불일치 시 무조건 전부 밀어버림.
 */
const APP_VERSION = "2026-06-09-winrate"; // ⚠️ 배포마다 갱신

export function CacheGuard() {
  useEffect(() => {
    try {
      if (localStorage.getItem("naktal_app_version") !== APP_VERSION) {
        localStorage.clear();
        try { sessionStorage.clear(); } catch { /* 무시 */ }
        localStorage.setItem("naktal_app_version", APP_VERSION);
      }
    } catch { /* 무시 */ }
  }, []);
  return null;
}
