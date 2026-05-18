"use client";
import Link from "next/link";
import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";

// 박상빈님 5/18 명시: 관리자 사이드바 Link 클릭 시 즉시 시각 피드백
// 페이지 server component fetch 동안 박상빈님이 클릭 반응 확인 가능
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
      <style>{`@keyframes adminspin { to { transform: rotate(360deg); } }`}</style>
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
