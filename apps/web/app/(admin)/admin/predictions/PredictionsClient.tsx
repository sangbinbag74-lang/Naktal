"use client";

import { useEffect, useState } from "react";

interface Row {
  annId: string;
  konepsId: string;
  title: string;
  orgName: string;
  category: string;
  region: string;
  budget: number;
  bsisAmt: number;
  deadline: string;
  predictedSajungRate: number | null;
  predOptimalBid: number | null;
  predLowerLimit: number | null;
  winProbability: number | null;
  sampleSize: number | null;
  predCreatedAt: string | null;
  actualBidRate: number | null;
  actualFinalPrice: number | null;
  numBidders: number | null;
  winnerName: string | null;
  deviation: number | null;
}

function fmtPrice(n: number | null): string {
  if (n == null || n === 0) return "-";
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}
function fmtPct(n: number | null, decimals = 3): string {
  if (n == null) return "-";
  return `${n.toFixed(decimals)}%`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function PredictionsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"active" | "closed">("active");

  useEffect(() => {
    let aborted = false;
    setLoading(true);
    fetch(`/api/admin/predictions?status=${status}&limit=100`)
      .then((r) => r.json())
      .then((j) => {
        if (!aborted) {
          setRows(j.data ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!aborted) setLoading(false);
      });
    return () => { aborted = true; };
  }, [status]);

  return (
    <div>
      {/* 탭 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[
          { key: "active" as const, label: "진행중 (AI 예측)" },
          { key: "closed" as const, label: "마감 (예측 vs 실제)" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid",
              borderColor: status === t.key ? "#1B3A6B" : "#E8ECF2",
              background: status === t.key ? "#1B3A6B" : "#fff",
              color: status === t.key ? "#fff" : "#374151",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: "#64748B" }}>불러오는 중...</div>}

      {!loading && rows.length === 0 && (
        <div style={{ color: "#64748B" }}>표시할 공고가 없습니다.</div>
      )}

      {!loading && rows.length > 0 && (
        <div style={{ overflowX: "auto", border: "1px solid #E8ECF2", borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E8ECF2" }}>
                <th style={th}>공고</th>
                <th style={th}>발주처</th>
                <th style={th}>업종</th>
                <th style={th}>마감</th>
                <th style={th}>기초금액</th>
                <th style={thHi}>AI 예측 사정율</th>
                <th style={thHi}>AI 추천 투찰가</th>
                <th style={thHi}>낙찰확률</th>
                {status === "closed" && (
                  <>
                    <th style={thOk}>실제 사정율</th>
                    <th style={thOk}>실제 낙찰가</th>
                    <th style={thOk}>참여자</th>
                    <th style={thOk}>편차</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.annId} style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={td}>
                    <a href={`/announcements/${r.konepsId}`} target="_blank" rel="noopener" style={{ color: "#1B3A6B", textDecoration: "none" }}>
                      {r.title.length > 40 ? r.title.slice(0, 40) + "..." : r.title}
                    </a>
                  </td>
                  <td style={td}>{r.orgName}</td>
                  <td style={td}>{r.category}</td>
                  <td style={td}>{fmtDate(r.deadline)}</td>
                  <td style={td}>{fmtPrice(r.bsisAmt || r.budget)}원</td>
                  <td style={tdHi}>{fmtPct(r.predictedSajungRate)}</td>
                  <td style={tdHi}>{fmtPrice(r.predOptimalBid)}원</td>
                  <td style={tdHi}>{r.winProbability != null ? `${(r.winProbability * 100).toFixed(1)}%` : "-"}</td>
                  {status === "closed" && (
                    <>
                      <td style={tdOk}>{fmtPct(r.actualBidRate)}</td>
                      <td style={tdOk}>{fmtPrice(r.actualFinalPrice)}원</td>
                      <td style={tdOk}>{r.numBidders ?? "-"}</td>
                      <td style={{ ...tdOk, color: r.deviation != null && Math.abs(r.deviation) > 0.5 ? "#DC2626" : "#059669" }}>
                        {r.deviation != null ? `${r.deviation > 0 ? "+" : ""}${r.deviation.toFixed(2)}%p` : "-"}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && rows.length > 0 && status === "closed" && (
        <div style={{ marginTop: 16, padding: 16, background: "#F8FAFC", borderRadius: 8, fontSize: 12, color: "#475569" }}>
          <strong>편차 색상:</strong>{" "}
          <span style={{ color: "#059669" }}>녹색 (±0.5%p 이내, 적중)</span>{" "}
          /{" "}
          <span style={{ color: "#DC2626" }}>빨강 (±0.5%p 초과, 실패)</span>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#475569" };
const thHi: React.CSSProperties = { ...th, background: "#EEF2FF", color: "#3730A3" };
const thOk: React.CSSProperties = { ...th, background: "#F0FDF4", color: "#15803D" };
const td: React.CSSProperties = { padding: "10px 12px", color: "#0F172A", verticalAlign: "top" };
const tdHi: React.CSSProperties = { ...td, background: "#F5F7FF", fontWeight: 500 };
const tdOk: React.CSSProperties = { ...td, background: "#F8FFF9", fontWeight: 500 };
