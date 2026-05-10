"use client";

import Link from "next/link";

interface Props {
  annId: string;
  title: string;
  orgName: string;
  contractAt: string;
  recommendedBidPrice: number;
  deadline: string;
  isWon: boolean | null;
}

function fmtPrice(n: number) {
  if (!n) return "-";
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

function getDDay(deadline: string) {
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  if (diff <= 0) return { label: "마감", bg: "#F1F5F9", color: "#94A3B8" };
  if (diff <= 2) return { label: `D-${diff}`, bg: "#FEF2F2", color: "#DC2626" };
  if (diff <= 5) return { label: `D-${diff}`, bg: "#FFF7ED", color: "#C2410C" };
  if (diff <= 10) return { label: `D-${diff}`, bg: "#EFF6FF", color: "#1E40AF" };
  return { label: `D-${diff}`, bg: "#F1F5F9", color: "#475569" };
}

function WonBadge({ isWon }: { isWon: boolean | null }) {
  if (isWon === true) return (
    <span style={{ fontSize: 13, fontWeight: 700, color: "#059669", background: "#ECFDF5", padding: "6px 14px", borderRadius: 7, border: "1px solid #86EFAC" }}>
      ✅ 낙찰 (1순위)
    </span>
  );
  if (isWon === false) return (
    <span style={{ fontSize: 13, fontWeight: 600, color: "#94A3B8", background: "#F1F5F9", padding: "6px 14px", borderRadius: 7 }}>
      미낙찰
    </span>
  );
  return (
    <span style={{ fontSize: 13, fontWeight: 600, color: "#60A5FA", background: "#EFF6FF", padding: "6px 14px", borderRadius: 7 }}>
      결과 확인 중
    </span>
  );
}

export function ContractRow({ annId, title, orgName, contractAt, recommendedBidPrice, deadline, isWon }: Props) {
  const dday = getDDay(deadline);
  const won = isWon === true;

  // <a> nesting 회피 — div + onClick(window.open) 으로 새 탭 열기
  function openInNewTab(href: string) {
    window.open(href, "_blank", "noopener,noreferrer");
  }

  return (
    <div
      onClick={() => openInNewTab(`/bid-result/${annId}`)}
      style={{
        background: won ? "linear-gradient(135deg, #fff 0%, #ECFDF5 100%)" : "#fff",
        borderRadius: 14, border: `1px solid ${won ? "#86EFAC" : "#E8ECF2"}`,
        padding: "22px 26px",
        cursor: "pointer",
        transition: "all 0.15s",
        boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 6px 18px rgba(15,23,42,0.08)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 2px rgba(15,23,42,0.04)"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 22, alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 8, letterSpacing: "-0.01em" }}>
            {title}
          </div>
          <div style={{ fontSize: 12.5, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 12 }}>
            <span>{orgName} · 의뢰일 {fmtDate(contractAt)}</span>
            <span style={{ color: "#CBD5E1" }}>|</span>
            <Link
              href={`/bid-contract/${annId}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ color: "#1B3A6B", textDecoration: "none", fontWeight: 600 }}
              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
            >
              계약서
            </Link>
            <Link
              href={`/announcements/${annId}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ color: "#1B3A6B", textDecoration: "none", fontWeight: 600 }}
              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
            >
              공고
            </Link>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 10.5, color: "#94A3B8", marginBottom: 3, fontWeight: 600 }}>AI 추천</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1B3A6B", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
            {fmtPrice(recommendedBidPrice)}원
          </div>
        </div>
        <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 7, background: dday.bg, color: dday.color, minWidth: 52, textAlign: "center" }}>
          {dday.label}
        </span>
        <div style={{ flexShrink: 0, minWidth: 120, textAlign: "right" }}>
          <WonBadge isWon={isWon} />
        </div>
      </div>
    </div>
  );
}
