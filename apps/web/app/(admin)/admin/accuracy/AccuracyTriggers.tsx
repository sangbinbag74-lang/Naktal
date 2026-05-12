"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RunSummary {
  ok: boolean;
  predFilled: number;
  predIterations: number;
  resultUpdated: number;
  resultTotal: number;
  resultG2bFetched: number;
  error?: string;
}

export function AccuracyTriggers() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<RunSummary | null>(null);

  async function handleSync() {
    setRunning(true);
    setSummary(null);

    // 분석(run-predictions)과 결과 수집(refresh-outcomes) 동시 실행
    // 분석은 반복 호출 — 최대 30회 (50건 × 30 = 1500건)
    const predTask = (async () => {
      let totalFilled = 0;
      let iterations = 0;
      for (let i = 0; i < 30; i++) {
        const res = await fetch("/api/admin/run-predictions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ catFilter: "construction" }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(err.error || `예측 HTTP ${res.status}`);
        }
        const data = await res.json() as { filled?: number };
        const filled = data.filled ?? 0;
        totalFilled += filled;
        iterations = i + 1;
        if (filled === 0) break;
      }
      return { totalFilled, iterations };
    })();

    const resultTask = (async () => {
      const res = await fetch("/api/admin/refresh-outcomes", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || `결과 HTTP ${res.status}`);
      }
      return await res.json() as { updated?: number; total?: number; g2bFetched?: number };
    })();

    try {
      const [pred, result] = await Promise.all([predTask, resultTask]);
      setSummary({
        ok: true,
        predFilled: pred.totalFilled,
        predIterations: pred.iterations,
        resultUpdated: result.updated ?? 0,
        resultTotal: result.total ?? 0,
        resultG2bFetched: result.g2bFetched ?? 0,
      });
      router.refresh();
    } catch (e) {
      setSummary({
        ok: false,
        predFilled: 0, predIterations: 0,
        resultUpdated: 0, resultTotal: 0, resultG2bFetched: 0,
        error: (e as Error).message,
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: summary ? 12 : 0, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>예측 + 결과 동시 갱신</div>
          <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 3, lineHeight: 1.5 }}>
            활성 공고 → BidPricePrediction 적재 (공사 우선) · 마감+1h 지난 BidRequest → 낙찰 결과 자동 채움
          </div>
        </div>
        <button
          onClick={handleSync}
          disabled={running}
          style={{
            padding: "10px 18px", borderRadius: 8, border: "none",
            background: running ? "#CBD5E1" : "#1B3A6B",
            color: "#fff", fontWeight: 700, fontSize: 13,
            cursor: running ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {running ? "동기화 중…" : "⚡ 지금 동기화"}
        </button>
      </div>
      {summary && (
        <div style={{
          padding: "10px 12px", borderRadius: 8, fontSize: 12,
          background: summary.ok ? "#ECFDF5" : "#FEF2F2",
          color: summary.ok ? "#065F46" : "#DC2626",
          border: `1px solid ${summary.ok ? "#A7F3D0" : "#FECACA"}`,
          lineHeight: 1.6,
        }}>
          {summary.ok ? (
            <>
              <strong>✓ 동기화 완료</strong>
              <div style={{ marginTop: 4 }}>
                예측 적재 {summary.predFilled}건 ({summary.predIterations}회 반복) ·
                결과 갱신 {summary.resultUpdated}/{summary.resultTotal}건 ·
                G2B 직접 조회 {summary.resultG2bFetched}건
              </div>
            </>
          ) : (
            <>✗ {summary.error ?? "알 수 없는 오류"}</>
          )}
        </div>
      )}
    </div>
  );
}
