"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type AnnInfo = { id: string; title: string; orgName: string; deadline: string; budget: string; category: string } | null;
type BppItem = {
  annId: string;
  predictedSajungRate: number;
  optimalBidPrice: string | null;
  bidPriceRangeLow: string | null;
  bidPriceRangeHigh: string | null;
  winProbability: number | null;
  sampleSize: number | null;
  expiresAt: string;
  createdAt: string;
  announcement: AnnInfo;
};

interface Props {
  bppList: BppItem[];
  activeCount: number;
  predCount: number;
}

const fmtPrice = (n: string | number | null | undefined) =>
  n != null && n !== "" ? Number(n).toLocaleString("ko-KR") + "원" : "-";

function dday(deadline: string): { label: string; color: string } {
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  if (diff <= 0) return { label: "마감", color: "#9CA3AF" };
  if (diff <= 2) return { label: `D-${diff}`, color: "#DC2626" };
  if (diff <= 5) return { label: `D-${diff}`, color: "#C2410C" };
  if (diff <= 10) return { label: `D-${diff}`, color: "#1E40AF" };
  return { label: `D-${diff}`, color: "#475569" };
}

export function AccuracyClient({ bppList, activeCount, predCount }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [running, setRunning] = useState(false);
  const [runLog, setRunLog] = useState<string | null>(null);

  const unpredCount = Math.max(0, activeCount - predCount);

  const filtered = bppList.filter((r) => {
    if (!search) return true;
    const ann = r.announcement;
    return (
      ann?.title?.includes(search) ||
      ann?.orgName?.includes(search)
    );
  });

  async function handleRunAll() {
    setRunning(true);
    setRunLog("분석 시작...");
    let totalFilled = 0;
    let totalSkipped = 0;
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch("/api/admin/run-predictions", { method: "POST" });
        const result = await res.json();
        if (!result.ok) { setRunLog("오류 발생: " + (result.error ?? "알 수 없음")); break; }
        totalFilled += result.filled ?? 0;
        totalSkipped += result.skipped ?? 0;
        setRunLog(`분석 중... ${totalFilled}건 완료 (스킵 ${totalSkipped}건)`);
        if ((result.filled ?? 0) === 0) break;
      } catch {
        setRunLog("네트워크 오류");
        break;
      }
    }
    setRunLog(`완료 — 총 ${totalFilled}건 분석, ${totalSkipped}건 스킵 (데이터 부족)`);
    setRunning(false);
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 현황 카드 3개 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[
          { label: "진행중 공고", value: activeCount + "건", color: "#374151" },
          { label: "AI 분석 완료", value: predCount + "건", color: "#059669" },
          { label: "미분석 공고", value: unpredCount + "건", color: unpredCount > 0 ? "#D97706" : "#9CA3AF" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "16px" }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* 툴바 */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          placeholder="공고명 / 발주처 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: "1 1 200px", minWidth: 160, padding: "7px 11px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 12.5, outline: "none" }}
        />
        <span style={{ fontSize: 12, color: "#9CA3AF", whiteSpace: "nowrap" }}>{filtered.length}건</span>
        <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <button
            onClick={handleRunAll}
            disabled={running}
            style={{ fontSize: 12, padding: "7px 16px", borderRadius: 8, border: "none", background: running ? "#E2E8F0" : "#1B3A6B", color: running ? "#94A3B8" : "#fff", cursor: running ? "default" : "pointer", fontWeight: 700, whiteSpace: "nowrap" }}
          >
            {running ? "분석 중..." : `⚡ 전체 분석 실행${unpredCount > 0 ? ` (${unpredCount}건)` : ""}`}
          </button>
          {runLog && (
            <div style={{ fontSize: 11, color: running ? "#D97706" : "#059669" }}>{runLog}</div>
          )}
        </div>
      </div>

      {/* 공고 목록 테이블 */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 14 }}>
          AI 분석 완료 공고 목록
          <span style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 400, marginLeft: 8 }}>
            (현재 유효한 예측 {predCount}건)
          </span>
        </div>
        {filtered.length === 0 ? (
          <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
            {bppList.length === 0 ? "분석된 공고 없음 — 전체 분석 실행 버튼을 클릭하세요" : "검색 결과 없음"}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  {["공고명", "발주처", "마감일", "예산", "AI 추천금액", "예측사정율", "낙찰확률", "샘플수"].map((h) => (
                    <th key={h} style={{ padding: "9px 12px", textAlign: "left", color: "#374151", fontWeight: 600, borderBottom: "2px solid #E8ECF2", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const ann = r.announcement;
                  const dd = ann?.deadline ? dday(ann.deadline) : null;
                  const lowHighLabel = r.bidPriceRangeLow && r.bidPriceRangeHigh
                    ? `${(Number(r.bidPriceRangeLow) / 100000000).toFixed(2)}억 ~ ${(Number(r.bidPriceRangeHigh) / 100000000).toFixed(2)}억`
                    : null;
                  const winProb = r.winProbability != null ? (r.winProbability * 100).toFixed(1) : null;
                  const probColor = winProb == null ? "#9CA3AF" : Number(winProb) >= 30 ? "#059669" : Number(winProb) >= 10 ? "#D97706" : "#DC2626";

                  return (
                    <tr key={r.annId ?? i} style={{ borderBottom: "1px solid #F1F5F9" }}>
                      {/* 공고명 */}
                      <td style={{ padding: "8px 12px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={ann?.title ?? ""}>
                        {ann?.id ? (
                          <Link href={`/announcements/${ann.id}`} target="_blank"
                            style={{ color: "#1B3A6B", fontWeight: 500, textDecoration: "none" }}>
                            {ann.title ?? r.annId}
                          </Link>
                        ) : (
                          <span style={{ color: "#9CA3AF" }}>{r.annId}</span>
                        )}
                      </td>
                      {/* 발주처 */}
                      <td style={{ padding: "8px 12px", color: "#374151", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={ann?.orgName ?? ""}>
                        {ann?.orgName ?? "-"}
                      </td>
                      {/* 마감일 */}
                      <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                        {ann?.deadline ? (
                          <div>
                            <div style={{ color: "#6B7280", fontSize: 11.5 }}>{new Date(ann.deadline).toLocaleDateString("ko-KR")}</div>
                            {dd && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: dd.color, background: dd.color + "1a", padding: "1px 5px", borderRadius: 4 }}>
                                {dd.label}
                              </span>
                            )}
                          </div>
                        ) : <span style={{ color: "#D1D5DB" }}>-</span>}
                      </td>
                      {/* 예산 */}
                      <td style={{ padding: "8px 12px", color: "#374151", whiteSpace: "nowrap" }}>
                        {ann?.budget ? fmtPrice(ann.budget) : "-"}
                      </td>
                      {/* AI 추천금액 */}
                      <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                        {r.optimalBidPrice ? (
                          <div>
                            <div style={{ color: "#1B3A6B", fontWeight: 700 }}>{fmtPrice(r.optimalBidPrice)}</div>
                            {lowHighLabel && <div style={{ color: "#9CA3AF", fontSize: 10, marginTop: 1 }}>{lowHighLabel}</div>}
                          </div>
                        ) : <span style={{ color: "#D1D5DB" }}>-</span>}
                      </td>
                      {/* 예측사정율 */}
                      <td style={{ padding: "8px 12px", color: "#1B3A6B", fontWeight: 600, whiteSpace: "nowrap" }}>
                        {r.predictedSajungRate != null ? Number(r.predictedSajungRate).toFixed(2) + "%" : "-"}
                      </td>
                      {/* 낙찰확률 */}
                      <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                        {winProb ? (
                          <span style={{ fontSize: 12, fontWeight: 700, color: probColor }}>
                            {winProb}%
                          </span>
                        ) : <span style={{ color: "#D1D5DB" }}>-</span>}
                      </td>
                      {/* 샘플수 */}
                      <td style={{ padding: "8px 12px", color: "#9CA3AF", whiteSpace: "nowrap" }}>
                        {r.sampleSize != null ? r.sampleSize + "건" : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
