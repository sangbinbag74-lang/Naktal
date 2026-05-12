"use client";

import Link from "next/link";
import type { ContractListItem } from "@/app/(dashboard)/contracts/page";

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

export function ContractList({ items }: { items: ContractListItem[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map((c) => <ContractCard key={c.id} c={c} />)}
    </div>
  );
}

function ContractCard({ c }: { c: ContractListItem }) {
  const dday = getDDay(c.deadline);
  const won = c.isWon === true;
  const lost = c.isWon === false;
  const pending = c.isWon == null;

  const recPrice = Number(c.recommendedBidPrice);
  const userBid = c.userBidPrice != null ? Number(c.userBidPrice) : null;
  const userRank = c.userRank;
  const totalBidders = c.totalBidders;
  const actualSajung = c.actualSajungRate != null ? Number(c.actualSajungRate) : null;
  const predictedSajung = c.predictedSajungRate != null ? Number(c.predictedSajungRate) : null;
  const deviation = c.deviationPct != null ? Number(c.deviationPct) : null;

  function openInNewTab(href: string) {
    window.open(href, "_blank", "noopener,noreferrer");
  }

  // 보조행: 모든 상태에서 풀 정보 표시 (사용자 명시)
  const showDetailMetrics = userBid != null;

  return (
    <div
      onClick={() => openInNewTab(`/bid-result/${c.annId}`)}
      style={{
        background: won ? "linear-gradient(135deg, #fff 0%, #ECFDF5 100%)" : "#fff",
        borderRadius: 14, border: `1px solid ${won ? "#86EFAC" : "#E8ECF2"}`,
        padding: "20px 24px",
        cursor: "pointer",
        transition: "all 0.15s",
        boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 6px 18px rgba(15,23,42,0.08)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 2px rgba(15,23,42,0.04)"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      {/* 상단: 제목 + 추천금액 + 상태 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 22, alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 6, letterSpacing: "-0.01em" }}>
            {c.title}
          </div>
          <div style={{ fontSize: 12, color: "#64748B", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>{c.orgName}</span>
            <span style={{ color: "#CBD5E1" }}>·</span>
            <span>의뢰 {fmtDate(c.contractAt)}</span>
            {c.openingDt && (
              <>
                <span style={{ color: "#CBD5E1" }}>·</span>
                <span>개찰 {fmtDate(c.openingDt)}</span>
              </>
            )}
            <span style={{ color: "#CBD5E1" }}>|</span>
            <Link
              href={`/bid-contract/${c.annId}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ color: "#1B3A6B", textDecoration: "none", fontWeight: 600 }}
            >계약서</Link>
            <Link
              href={`/announcements/${c.annId}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ color: "#1B3A6B", textDecoration: "none", fontWeight: 600 }}
            >공고</Link>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 10.5, color: "#94A3B8", marginBottom: 3, fontWeight: 600 }}>AI 추천</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#1B3A6B", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
            {fmtPrice(recPrice)}원
          </div>
        </div>
        <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 7, background: dday.bg, color: dday.color, minWidth: 52, textAlign: "center" }}>
          {dday.label}
        </span>
        <div style={{ flexShrink: 0, minWidth: 130, textAlign: "right" }}>
          <WonBadge isWon={c.isWon} userRank={userRank} totalBidders={totalBidders} userBidPrice={userBid} />
        </div>
      </div>

      {/* 하단: 상세 결과 — 데이터 있을 때만 */}
      {showDetailMetrics && userBid != null && (
        <div style={{
          marginTop: 14, paddingTop: 12, borderTop: "1px solid #F1F5F9",
          display: "flex", flexWrap: "wrap", gap: 22, fontSize: 12.5,
        }}>
          {userRank != null ? (
            <span>
              <span style={{ color: "#94A3B8" }}>내 순위 </span>
              <strong style={{ color: userRank === 1 ? "#059669" : userRank <= 3 ? "#D97706" : "#374151" }}>
                {userRank}{totalBidders ? ` / ${totalBidders}` : ""}위
              </strong>
            </span>
          ) : (userBid != null && (
            <span>
              <span style={{ color: "#94A3B8" }}>내 순위 </span>
              <strong style={{ color: "#DC2626" }}>부적격</strong>
            </span>
          ))}
          <span>
            <span style={{ color: "#94A3B8" }}>내 투찰 </span>
            <strong style={{ color: "#0F172A" }}>{fmtPrice(userBid)}원</strong>
            {c.userBidRate != null && <span style={{ color: "#94A3B8", marginLeft: 6 }}>({Number(c.userBidRate).toFixed(3)}%)</span>}
          </span>
          {actualSajung != null && (
            <span>
              <span style={{ color: "#94A3B8" }}>실제 사정율 </span>
              <strong>{actualSajung.toFixed(3)}%</strong>
              {predictedSajung != null && deviation != null && (
                <span style={{ color: deviation <= 0.5 ? "#059669" : "#94A3B8", marginLeft: 6, fontSize: 11 }}>
                  (예측 {predictedSajung.toFixed(3)}% · 오차 {deviation.toFixed(3)}%)
                </span>
              )}
            </span>
          )}
          {won && c.feeAmount && Number(c.feeAmount) > 0 && (
            <span>
              <span style={{ color: "#94A3B8" }}>수수료 </span>
              <strong style={{ color: "#D97706" }}>{fmtPrice(Number(c.feeAmount))}원</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function WonBadge({
  isWon, userRank, totalBidders, userBidPrice,
}: {
  isWon: boolean | null;
  userRank: number | null;
  totalBidders: number | null;
  userBidPrice: number | null;
}) {
  if (isWon === true) return (
    <span style={{ fontSize: 13, fontWeight: 700, color: "#059669", background: "#ECFDF5", padding: "6px 14px", borderRadius: 7, border: "1px solid #86EFAC" }}>
      ✅ 낙찰 (1순위)
    </span>
  );
  if (isWon === false) {
    // 미낙찰 — 작고 평범하게 + 아래에 순위
    const rankLabel = userRank != null
      ? `${userRank}${totalBidders ? ` / ${totalBidders}` : ""}위`
      : userBidPrice != null ? "부적격" : null;
    return (
      <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: "#64748B", background: "#F1F5F9", padding: "4px 10px", borderRadius: 6 }}>
          미낙찰
        </span>
        {rankLabel && (
          <span style={{ fontSize: 11, color: "#94A3B8" }}>
            내 순위 <strong style={{ color: "#475569" }}>{rankLabel}</strong>
          </span>
        )}
      </div>
    );
  }
  return (
    <span style={{ fontSize: 13, fontWeight: 600, color: "#60A5FA", background: "#EFF6FF", padding: "6px 14px", borderRadius: 7 }}>
      결과 수집 중
    </span>
  );
}
