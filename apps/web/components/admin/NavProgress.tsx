"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// 박상빈님 5/18 명시 — 관리자 모든 페이지 navigation 진행률 bar
// 페이지 진입 시 짧게 노출되어 박상빈님 버튼 클릭 시 즉각 피드백 제공
export function NavProgress() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    setShow(true);
    setWidth(0);
    // 천천히 증가하다가 완료 시 사라짐 (실제 navigation 완료 신호)
    const t1 = setTimeout(() => setWidth(30), 50);
    const t2 = setTimeout(() => setWidth(60), 200);
    const t3 = setTimeout(() => setWidth(85), 500);
    const t4 = setTimeout(() => setWidth(100), 800);
    const t5 = setTimeout(() => setShow(false), 1000);
    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5);
    };
  }, [pathname]);

  if (!show) return null;
  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      width: `${width}%`,
      height: 3,
      background: "linear-gradient(90deg, #1B3A6B 0%, #60A5FA 100%)",
      boxShadow: "0 0 8px rgba(96,165,250,0.6)",
      zIndex: 9999,
      transition: "width 0.3s ease-out, opacity 0.2s",
      opacity: width === 100 ? 0 : 1,
    }} />
  );
}
