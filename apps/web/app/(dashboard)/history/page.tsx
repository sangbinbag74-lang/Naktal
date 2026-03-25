"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Rec {
  id: string;
  annId: string | null;
  annTitle: string | null;
  annOrgName: string | null;
  annBudget: string | null;
  annDeadline: string | null;
  category: string | null;
  budgetRange: string | null;
  region: string | null;
  combo1: number[];
  combo2: number[];
  combo3: number[];
  hitRate1: number;
  hitRate2: number;
  hitRate3: number;
  sampleSize: number;
  modelVersion: string;
  createdAt: string;
}

function NumBadge({ n, accent }: { n: number; accent: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 28, height: 28, borderRadius: "50%",
      background: accent, color: "#fff", fontSize: 12, fontWeight: 700,
    }}>
      {String(n).padStart(2, "0")}
    </span>
  );
}

export default function HistoryPage() {
  const [recs, setRecs] = useState<Rec[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/strategy/history")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        setRecs(d.recommendations ?? []);
        setTotal(d.total ?? 0);
      })
      .catch(() => setError("데이터를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, color: "#94A3B8" }}>로딩 중...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>분석 이력</h2>
          <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>번호 추천을 받은 공고 목록입니다.</p>
        </div>
        {total > 0 && (
          <span style={{ fontSize: 13, color: "#64748B" }}>총 {total}건</span>
        )}
      </div>

      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "14px 18px", fontSize: 13, color: "#DC2626" }}>
          {error}
        </div>
      )}

      {!error && recs.length === 0 && (
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "56px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginBottom: 8 }}>아직 번호 분석 이력이 없습니다</div>
          <div style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 20 }}>복수예가 공고에서 번호 추천을 받아보세요</div>
          <Link href="/announcements" style={{
            display: "inline-block", background: "#1B3A6B", color: "#fff",
            padding: "10px 24px", borderRadius: 10, textDecoration: "none",
            fontWeight: 600, fontSize: 14,
          }}>
            공고 목록 보기
          </Link>
        </div>
      )}

      {recs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {recs.map((r) => {
            const isClosed = r.annDeadline ? new Date(r.annDeadline) < new Date() : true;
            const dday = r.annDeadline
              ? Math.ceil((new Date(r.annDeadline).getTime() - Date.now()) / 86400000)
              : null;
            return (
              <div key={r.id} style={{
                background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2",
                padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14,
              }}>
                {/* 헤더 행 */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 3 }}>
                      {new Date(r.createdAt).toLocaleString("ko-KR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {r.modelVersion && <span style={{ marginLeft: 8, color: "#CBD5E1" }}>{r.modelVersion}</span>}
                    </div>
                    {r.annTitle ? (
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.annTitle}
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: "#94A3B8" }}>공고 정보 없음 · {r.category || r.region || r.budgetRange}</div>
                    )}
                    {r.annOrgName && (
                      <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                        {r.annOrgName}{r.annBudget ? ` · ${r.annBudget}` : ""}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {dday !== null && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 5,
                        background: isClosed ? "#F1F5F9" : dday <= 2 ? "#FEF2F2" : dday <= 7 ? "#FFF7ED" : "#EEF2FF",
                        color: isClosed ? "#94A3B8" : dday <= 2 ? "#DC2626" : dday <= 7 ? "#C2410C" : "#1B3A6B",
                      }}>
                        {isClosed ? "마감" : `D-${dday}`}
                      </span>
                    )}
                    {r.annId && !isClosed && (
                      <Link href={`/announcements/${r.annId}`} style={{
                        fontSize: 12, padding: "4px 12px", borderRadius: 7,
                        background: "#EEF2FF", color: "#1B3A6B", fontWeight: 600,
                        textDecoration: "none",
                      }}>
                        공고 보기
                      </Link>
                    )}
                  </div>
                </div>

                {/* 번호 조합 행 */}
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {([
                    { combo: r.combo1, hitRate: r.hitRate1, label: "조합 1", accent: "#1B3A6B" },
                    { combo: r.combo2, hitRate: r.hitRate2, label: "조합 2", accent: "#1E40AF" },
                    { combo: r.combo3, hitRate: r.hitRate3, label: "조합 3", accent: "#2563EB" },
                  ] as const).map(({ combo, hitRate, label, accent }) => (
                    <div key={label} style={{
                      flex: 1, minWidth: 140,
                      background: "#F8FAFC", borderRadius: 10, padding: "10px 14px",
                      borderLeft: `3px solid ${accent}`,
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: accent, marginBottom: 8, letterSpacing: "0.05em" }}>
                        {label} · {hitRate?.toFixed(1) ?? "—"}%
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {(combo ?? []).map((n, i) => <NumBadge key={i} n={n} accent={accent} />)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 푸터 */}
                <div style={{ fontSize: 11, color: "#CBD5E1" }}>
                  분석 샘플 {(r.sampleSize ?? 0).toLocaleString()}건
                  {r.category && ` · ${r.category}`}
                  {r.region && ` · ${r.region}`}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
