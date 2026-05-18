"use client";
import Link from "next/link";
import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";

// 박상빈님 5/18 명시: 관리자 사이드바 Link 클릭 시 "즉시" 시각 피드백
// useLinkStatus pending = Link 클릭 직후 ~ 페이지 도착 완료 시점까지 true.
// 클릭하는 그 순간부터 박상빈님이 반응을 확인할 수 있어야 함.
// → 사이드바 항목 옆 작은 스피너 + 화면 상단 두꺼운 진행률 bar 동시 표시
function LinkContent({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, width: "100%" }}>
      <span style={{ flex: 1, display: "inline-flex", alignItems: "center", gap: 10 }}>{children}</span>
      {pending && (
        <span style={{
          width: 12, height: 12,
          border: "2px solid rgba(255,255,255,0.3)",
          borderTopColor: "#60A5FA",
          borderRadius: "50%",
          animation: "adminspin 0.6s linear infinite",
          flexShrink: 0,
        }} />
      )}
      {/* 화면 상단 fixed 진행률 bar — 클릭 즉시 표시, 페이지 도착 시 즉시 사라짐 */}
      {pending && (
        <span
          aria-hidden
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0,
            height: 4,
            background: "linear-gradient(90deg, #1B3A6B 0%, #60A5FA 50%, #93C5FD 100%)",
            boxShadow: "0 0 12px rgba(96,165,250,0.85)",
            zIndex: 9999,
            animation: "adminbarslide 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite",
            pointerEvents: "none",
          }}
        />
      )}
      <style>{`
        @keyframes adminspin { to { transform: rotate(360deg); } }
        @keyframes adminbarslide {
          0%   { transform: translateX(-100%); opacity: 0.6; }
          50%  { transform: translateX(0%);    opacity: 1;   }
          100% { transform: translateX(100%);  opacity: 0.6; }
        }
      `}</style>
    </span>
  );
}

export function AdminNavLink({
  href, children, style, prefetch = false,
}: {
  href: string;
  children: ReactNode;
  style?: React.CSSProperties;
  prefetch?: boolean;
}) {
  return (
    <Link href={href} prefetch={prefetch} style={style}>
      <LinkContent>{children}</LinkContent>
    </Link>
  );
}
