"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// 어드민 requests 페이지 진입 시 1회 자동 호출
// 마감 + 1시간 지난 BidRequest 결과 자동 채우기 (cron 없이 사용자 진입 = 이벤트)
export function AutoRefreshTrigger() {
  const router = useRouter();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    fetch("/api/admin/refresh-outcomes", { method: "POST" })
      .then((r) => r.json())
      .then((d: { updated?: number }) => {
        if (typeof d.updated === "number" && d.updated > 0) {
          router.refresh();
        }
      })
      .catch(() => { /* 무시 — 다음 진입 시 재시도 */ });
  }, [router]);

  return null;
}
