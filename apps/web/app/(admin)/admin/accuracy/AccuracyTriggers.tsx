"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RunSummary {
  ok: boolean;
  pullElapsedMs: number;
  pullOk: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pullDetail: any;
  predFilled: number;
  predIterations: number;
  resultUpdated: number;
  resultTotal: number;
  resultG2bFetched: number;
  aiUpdated: number;
  aiScanned: number;
  aiG2bFetched: number;
  aiNoResult: number;
  aiNoBase: number;
  aiBadPredicted: number;
  elapsedMs: number;
  error?: string;
}

type Stage = "idle" | "pull" | "pred" | "result" | "done";

export function AccuracyTriggers() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [stageDetail, setStageDetail] = useState<string>("");
  const [summary, setSummary] = useState<RunSummary | null>(null);

  async function handleSync() {
    const startedAt = Date.now();
    setRunning(true);
    setSummary(null);

    // STEP 0: G2B 에서 최근 2일치 공고 + 낙찰 결과 끌어오기
    setStage("pull");
    setStageDetail("G2B에서 최근 2일치 공고·낙찰 결과 수집 중… (1~2분)");
    const pullStart = Date.now();
    let pullOk = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pullDetail: any = null;
    try {
      const pullRes = await fetch("/api/admin/g2b-pull", { method: "POST" });
      const data = await pullRes.json().catch(() => ({})) as { ok?: boolean; error?: string; syncResult?: unknown };
      pullOk = pullRes.ok && data.ok === true;
      pullDetail = data.syncResult ?? data;
      if (!pullOk) setStageDetail(`G2B 수집 실패: ${data.error ?? `HTTP ${pullRes.status}`} — 다음 단계로 계속`);
    } catch (e) {
      setStageDetail(`G2B 수집 오류: ${(e as Error).message} — 다음 단계로 계속`);
    }
    const pullElapsedMs = Date.now() - pullStart;

    setStage("pred");
    setStageDetail("예측 적재 시작…");

    // 분석(run-predictions) — 반복 호출 최대 60회 (단계 표시 위해 await)
    const predTask = (async () => {
      let totalFilled = 0;
      let iterations = 0;
      for (let i = 0; i < 60; i++) {
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
        setStageDetail(`예측 적재 ${totalFilled}건 (${iterations}회차)…`);
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
      return await res.json() as {
        updated?: number; total?: number; g2bFetched?: number;
        aiUpdated?: number; aiScanned?: number; aiG2bFetched?: number;
        aiNoResult?: number; aiNoBase?: number; aiBadPredicted?: number;
      };
    })();

    // 결과 갱신은 백그라운드로 시작하지만, 단계 표시는 예측 끝난 뒤 결과 단계로 전환
    let resultFinished = false;
    resultTask.finally(() => { resultFinished = true; });

    try {
      const pred = await predTask;
      setStage("result");
      setStageDetail(resultFinished ? "결과 정리 중…" : "결과 채움 진행 중…");
      const result = await resultTask;
      setStage("done");
      setSummary({
        ok: true,
        pullElapsedMs, pullOk, pullDetail,
        predFilled: pred.totalFilled,
        predIterations: pred.iterations,
        resultUpdated: result.updated ?? 0,
        resultTotal: result.total ?? 0,
        resultG2bFetched: result.g2bFetched ?? 0,
        aiUpdated: result.aiUpdated ?? 0,
        aiScanned: result.aiScanned ?? 0,
        aiG2bFetched: result.aiG2bFetched ?? 0,
        aiNoResult: result.aiNoResult ?? 0,
        aiNoBase: result.aiNoBase ?? 0,
        aiBadPredicted: result.aiBadPredicted ?? 0,
        elapsedMs: Date.now() - startedAt,
      });
      router.refresh();
    } catch (e) {
      setStage("done");
      setSummary({
        ok: false,
        pullElapsedMs, pullOk, pullDetail,
        predFilled: 0, predIterations: 0,
        resultUpdated: 0, resultTotal: 0, resultG2bFetched: 0,
        aiUpdated: 0, aiScanned: 0, aiG2bFetched: 0, aiNoResult: 0, aiNoBase: 0, aiBadPredicted: 0,
        elapsedMs: Date.now() - startedAt,
        error: (e as Error).message,
      });
    } finally {
      setRunning(false);
      setStageDetail("");
    }
  }

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: summary || running ? 12 : 0, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>G2B 수집 + 예측 + 결과 동시 갱신</div>
          <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 3, lineHeight: 1.5 }}>
            ① G2B에서 최근 2일치 공고·낙찰 결과 가져오기 · ② BidPricePrediction 적재 · ③ BidRequest·AI 예측 결과 자동 채움
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
            display: "flex", alignItems: "center", gap: 8,
          }}
        >
          {running && (
            <span style={{
              display: "inline-block", width: 12, height: 12, borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff",
              animation: "naktal-spin 0.7s linear infinite",
            }} />
          )}
          {running ? "동기화 중…" : "⚡ 지금 동기화"}
        </button>
      </div>

      <style>{`@keyframes naktal-spin { to { transform: rotate(360deg); } }`}</style>

      {/* 진행 단계 표시 */}
      {running && (
        <div style={{
          padding: "10px 12px", borderRadius: 8, fontSize: 12,
          background: "#EFF6FF", color: "#1E40AF", border: "1px solid #BFDBFE",
          marginBottom: 6,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <StageBadge label="1. G2B 수집"     active={stage === "pull"}   done={stage === "pred" || stage === "result" || stage === "done"} />
            <span style={{ color: "#CBD5E1" }}>→</span>
            <StageBadge label="2. 예측 적재"     active={stage === "pred"}   done={stage === "result" || stage === "done"} />
            <span style={{ color: "#CBD5E1" }}>→</span>
            <StageBadge label="3. 결과 채움"     active={stage === "result"} done={stage === "done"} />
            <span style={{ color: "#CBD5E1" }}>→</span>
            <StageBadge label="4. AI 예측 결과" active={stage === "result"} done={stage === "done"} />
          </div>
          {stageDetail && (
            <div style={{ marginTop: 6, fontSize: 11.5, color: "#1B3A6B" }}>{stageDetail}</div>
          )}
        </div>
      )}

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
              <span style={{ marginLeft: 8, fontSize: 10.5, color: "#94A3B8" }}>
                {(summary.elapsedMs / 1000).toFixed(1)}초 소요
              </span>
              <div style={{ marginTop: 4 }}>
                G2B 수집 {summary.pullOk ? "✓" : "✗"} ({(summary.pullElapsedMs / 1000).toFixed(1)}초)
                {summary.pullDetail && typeof summary.pullDetail === "object" && (
                  <span style={{ marginLeft: 6, fontSize: 11, color: "#94A3B8" }}>
                    {(() => {
                      const d = summary.pullDetail as Record<string, unknown>;
                      const parts: string[] = [];
                      if (d.recentAnn != null) parts.push(`공고 ${d.recentAnn}건`);
                      if (d.recentBid != null) parts.push(`낙찰 ${d.recentBid}건`);
                      if (d.totalAnnouncements != null && d.recentAnn == null) parts.push(`공고 ${d.totalAnnouncements}건`);
                      if (d.totalBidResults != null && d.recentBid == null) parts.push(`낙찰 ${d.totalBidResults}건`);
                      return parts.length ? `(${parts.join(", ")})` : null;
                    })()}
                  </span>
                )}
              </div>
              <div style={{ marginTop: 2 }}>
                예측 적재 {summary.predFilled}건 ({summary.predIterations}회 반복)
              </div>
              <div style={{ marginTop: 2 }}>
                BidRequest 결과 채움 {summary.resultUpdated}/{summary.resultTotal}건 (G2B 직접 조회 {summary.resultG2bFetched}건)
              </div>
              <div style={{ marginTop: 2 }}>
                AI 예측 결과 채움 <strong>{summary.aiUpdated}건</strong> / 스캔 {summary.aiScanned}건
                {summary.aiG2bFetched > 0 && (
                  <span style={{ marginLeft: 6, fontSize: 11, color: "#1B3A6B", fontWeight: 600 }}>
                    (G2B 직접 조회 {summary.aiG2bFetched}건)
                  </span>
                )}
                {(summary.aiNoResult > 0 || summary.aiNoBase > 0 || summary.aiBadPredicted > 0) && (
                  <span style={{ marginLeft: 6, fontSize: 11, color: "#94A3B8" }}>
                    (결과 미수집 {summary.aiNoResult} · 기초금액 없음 {summary.aiNoBase} · 예측값 0 {summary.aiBadPredicted})
                  </span>
                )}
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

function StageBadge({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  const bg = done ? "#059669" : active ? "#1B3A6B" : "#E2E8F0";
  const fg = done || active ? "#fff" : "#94A3B8";
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 6,
      background: bg, color: fg, whiteSpace: "nowrap",
      display: "inline-flex", alignItems: "center", gap: 5,
    }}>
      {done ? "✓" : active ? <Spinner /> : "○"} {label}
    </span>
  );
}

function Spinner() {
  return (
    <span style={{
      display: "inline-block", width: 9, height: 9, borderRadius: "50%",
      border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "#fff",
      animation: "naktal-spin 0.7s linear infinite",
    }} />
  );
}
