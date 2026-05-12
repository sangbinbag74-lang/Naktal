"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Result {
  ok: boolean;
  message: string;
}

export function AccuracyTriggers() {
  const router = useRouter();
  const [analyzing, setAnalyzing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<Result | null>(null);
  const [refreshResult, setRefreshResult] = useState<Result | null>(null);

  async function handleAnalyze() {
    setAnalyzing(true);
    setAnalyzeResult(null);
    try {
      // 반복 호출 — 최대 30회 (50건 × 30 = 1500건)
      let totalFilled = 0;
      let iterations = 0;
      for (let i = 0; i < 30; i++) {
        const res = await fetch("/api/admin/run-predictions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ catFilter: "construction" }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const data = await res.json() as { filled?: number; skipped?: number };
        const filled = data.filled ?? 0;
        totalFilled += filled;
        iterations = i + 1;
        if (filled === 0) break;
      }
      setAnalyzeResult({
        ok: true,
        message: `완료 — ${totalFilled}건 분석 (${iterations}회 반복)`,
      });
      router.refresh();
    } catch (e) {
      setAnalyzeResult({ ok: false, message: (e as Error).message });
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshResult(null);
    try {
      const res = await fetch("/api/admin/refresh-outcomes", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json() as { updated?: number; total?: number; skipped?: number; g2bFetched?: number };
      setRefreshResult({
        ok: true,
        message: `완료 — 처리 ${data.total ?? 0}건 / 갱신 ${data.updated ?? 0}건 / G2B 직접 ${data.g2bFetched ?? 0}건 / 결과없음 ${data.skipped ?? 0}건`,
      });
      router.refresh();
    } catch (e) {
      setRefreshResult({ ok: false, message: (e as Error).message });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "18px 20px" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>수동 트리거</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* 공고 자동분석 */}
        <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>공고 자동분석</div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>활성 공고 → BidPricePrediction 적재 (공사 카테고리)</div>
            </div>
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              style={{
                padding: "8px 14px", borderRadius: 8, border: "none",
                background: analyzing ? "#CBD5E1" : "#1B3A6B",
                color: "#fff", fontWeight: 700, fontSize: 12,
                cursor: analyzing ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {analyzing ? "분석중…" : "지금 실행"}
            </button>
          </div>
          {analyzeResult && (
            <div style={{
              padding: "8px 10px", borderRadius: 6, fontSize: 11, marginTop: 4,
              background: analyzeResult.ok ? "#ECFDF5" : "#FEF2F2",
              color: analyzeResult.ok ? "#059669" : "#DC2626",
              border: `1px solid ${analyzeResult.ok ? "#A7F3D0" : "#FECACA"}`,
            }}>
              {analyzeResult.ok ? "✓ " : "✗ "}{analyzeResult.message}
            </div>
          )}
        </div>

        {/* 공고 결과 받기 */}
        <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>공고 결과 받기</div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>마감+1h 지난 BidRequest → 낙찰 결과 자동 채움</div>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              style={{
                padding: "8px 14px", borderRadius: 8, border: "none",
                background: refreshing ? "#CBD5E1" : "#7C3AED",
                color: "#fff", fontWeight: 700, fontSize: 12,
                cursor: refreshing ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {refreshing ? "조회중…" : "지금 실행"}
            </button>
          </div>
          {refreshResult && (
            <div style={{
              padding: "8px 10px", borderRadius: 6, fontSize: 11, marginTop: 4,
              background: refreshResult.ok ? "#ECFDF5" : "#FEF2F2",
              color: refreshResult.ok ? "#059669" : "#DC2626",
              border: `1px solid ${refreshResult.ok ? "#A7F3D0" : "#FECACA"}`,
            }}>
              {refreshResult.ok ? "✓ " : "✗ "}{refreshResult.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
