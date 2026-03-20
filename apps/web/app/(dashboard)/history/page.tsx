"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Outcome {
  id: string;
  annId: string;
  recommendationId?: string;
  selectedNos: number[];
  bidRate: number;
  result: "WIN" | "LOSE" | "DISQUALIFIED" | "PENDING";
  recommendHit?: boolean;
  bidAt: string;
  recommendation?: { combo1: number[]; combo2: number[]; combo3: number[] };
}

interface Stats {
  total: number;
  wins: number;
  winRate: number;
  hitRate: number;
}

const RESULT_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  WIN: { label: "낙찰", color: "#059669", bg: "#ECFDF5" },
  LOSE: { label: "유찰", color: "#DC2626", bg: "#FEF2F2" },
  DISQUALIFIED: { label: "탈락", color: "#9CA3AF", bg: "#F9FAFB" },
  PENDING: { label: "대기중", color: "#F59E0B", bg: "#FFFBEB" },
};

export default function HistoryPage() {
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/strategy/history")
      .then((r) => r.json())
      .then((d) => { setOutcomes(d.outcomes ?? []); setStats(d.stats ?? null); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, color: "#94A3B8" }}>로딩 중...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>투찰 이력</h2>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>추천 번호 채택률과 낙찰 성과를 확인하세요.</p>
      </div>

      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { label: "총 투찰", value: stats.total + "건" },
            { label: "낙찰 건수", value: stats.wins + "건" },
            { label: "낙찰률", value: stats.winRate.toFixed(1) + "%" },
            { label: "추천 번호 적중률", value: stats.hitRate.toFixed(1) + "%" },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "16px" }}>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#1B3A6B" }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {outcomes.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "48px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginBottom: 8 }}>투찰 이력이 없습니다</div>
          <div style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 20 }}>번호 추천을 받고 결과를 입력해보세요</div>
          <Link href="/strategy" style={{ display: "inline-block", background: "#1B3A6B", color: "#fff", padding: "10px 24px", borderRadius: 10, textDecoration: "none", fontWeight: 600, fontSize: 14 }}>번호 추천받기</Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {outcomes.map((o) => {
            const tag = RESULT_LABELS[o.result] ?? { label: "대기중", color: "#F59E0B", bg: "#FFFBEB" };
            return (
              <div key={o.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 2 }}>{new Date(o.bidAt).toLocaleDateString("ko-KR")}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1B3A6B" }}>공고 #{o.annId}</div>
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>선택 번호</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>[{o.selectedNos.join(", ")}]</div>
                </div>
                {o.recommendation && (
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={{ fontSize: 11, color: "#9CA3AF" }}>추천 번호</div>
                    <div style={{ fontSize: 13, color: "#60A5FA" }}>[{o.recommendation.combo1.join(", ")}]</div>
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {o.recommendHit !== null && o.recommendHit !== undefined && (
                    <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 5, background: o.recommendHit ? "#ECFDF5" : "#FEF2F2", color: o.recommendHit ? "#059669" : "#DC2626", fontWeight: 700 }}>
                      {o.recommendHit ? "추천 적중" : "미적중"}
                    </span>
                  )}
                  <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, background: tag.bg, color: tag.color, fontWeight: 700 }}>{tag.label}</span>
                </div>
                {o.result === "PENDING" && o.recommendationId && (
                  <Link href={"/strategy/outcome/" + o.recommendationId}
                    style={{ fontSize: 12, padding: "6px 14px", borderRadius: 8, background: "#1B3A6B", color: "#fff", textDecoration: "none", fontWeight: 600, whiteSpace: "nowrap" }}>
                    결과 입력
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
