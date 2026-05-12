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

  // mode: "full" = G2B 수집 + 예측 + 결과 / "results" = 예측 + 결과만 / "pull" = G2B 수집만
  async function handleSync(mode: "full" | "results" | "pull" = "full") {
    const startedAt = Date.now();
    setRunning(true);
    setSummary(null);

    // STEP 0: G2B 수집 (mode=full 또는 mode=pull 일 때만)
    let pullElapsedMs = 0;
    let pullOk = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pullDetail: any = null;
    if (mode === "full" || mode === "pull") {
      setStage("pull");
      setStageDetail("G2B에서 최근 2일치 공고·낙찰 결과 수집 중… (1~2분)");
      const pullStart = Date.now();
      pullOk = false;
      try {
        const pullRes = await fetch("/api/admin/g2b-pull", { method: "POST" });
        const data = await pullRes.json().catch(() => ({})) as { ok?: boolean; error?: string; syncResult?: unknown };
        pullOk = pullRes.ok && data.ok === true;
        pullDetail = data.syncResult ?? data;
      } catch (e) {
        pullDetail = { error: (e as Error).message };
      }
      pullElapsedMs = Date.now() - pullStart;
    }

    if (mode === "pull") {
      // G2B 수집만 모드 — 여기서 끝
      setStage("done");
      setSummary({
        ok: pullOk,
        pullElapsedMs, pullOk, pullDetail,
        predFilled: 0, predIterations: 0,
        resultUpdated: 0, resultTotal: 0, resultG2bFetched: 0,
        aiUpdated: 0, aiScanned: 0, aiG2bFetched: 0,
        aiNoResult: 0, aiNoBase: 0, aiBadPredicted: 0,
        elapsedMs: Date.now() - startedAt,
        error: pullOk ? undefined : `G2B 수집 실패: ${JSON.stringify(pullDetail ?? {}).slice(0,200)}`,
      });
      // router.refresh() 제거 — 사용자가 결과 메시지 읽을 시간 확보. '결과 적용' 버튼으로 직접 새로고침.
      setRunning(false);
      setStageDetail("");
      return;
    }

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
    // 각 단계 개별 try-catch — 부분 실패도 사유 명시 (전체 fail 처리 X)
    const errors: string[] = [];
    if (mode === "full" && !pullOk) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = pullDetail as any;
      const detailMsg = d?.error ?? d?.message ?? JSON.stringify(d ?? {}).slice(0, 200);
      errors.push(`G2B 수집 실패: ${detailMsg}`);
    }

    let pred = { totalFilled: 0, iterations: 0 };
    try { pred = await predTask; }
    catch (e) { errors.push(`예측 적재 실패: ${(e as Error).message || String(e)}`); }

    setStage("result");
    setStageDetail("결과 채움 진행 중…");

    let result: {
      updated?: number; total?: number; g2bFetched?: number;
      aiUpdated?: number; aiScanned?: number; aiG2bFetched?: number;
      aiNoResult?: number; aiNoBase?: number; aiBadPredicted?: number;
    } = {};
    try { result = await resultTask; }
    catch (e) { errors.push(`결과 채움 실패: ${(e as Error).message || String(e)}`); }

    setStage("done");
    setSummary({
      ok: errors.length === 0,
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
      error: errors.length > 0 ? errors.join(" / ") : undefined,
    });
    // router.refresh() 제거 — 사용자가 결과 메시지 읽을 시간 확보. '결과 적용' 버튼으로 직접 새로고침.
    setRunning(false);
    setStageDetail("");
  }

  function handleApplyResults() {
    setSummary(null);
    router.refresh();
  }

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: summary || running ? 12 : 0, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>동기화 — 3가지 모드</div>
          <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 3, lineHeight: 1.5 }}>
            <strong>자동</strong>: 전체 (G2B 수집 + 예측 + 결과, 5~10분) · <strong>결과만</strong>: 예측 + 결과 채움 (DB 캐시, 수초~분) · <strong>공고만</strong>: G2B 수집만 (1~3분)
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            onClick={() => handleSync("full")}
            disabled={running}
            style={{
              padding: "10px 16px", borderRadius: 8, border: "none",
              background: running ? "#CBD5E1" : "#1B3A6B",
              color: "#fff", fontWeight: 700, fontSize: 12.5,
              cursor: running ? "not-allowed" : "pointer", whiteSpace: "nowrap",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {running && stage !== "idle" && (
              <span style={{ display: "inline-block", width: 11, height: 11, borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff",
                animation: "naktal-spin 0.7s linear infinite" }} />
            )}
            ⚡ 자동 (전체)
          </button>
          <button
            onClick={() => handleSync("results")}
            disabled={running}
            style={{
              padding: "10px 14px", borderRadius: 8, border: "1.5px solid #1B3A6B",
              background: running ? "#F1F5F9" : "#fff",
              color: running ? "#94A3B8" : "#1B3A6B", fontWeight: 700, fontSize: 12.5,
              cursor: running ? "not-allowed" : "pointer", whiteSpace: "nowrap",
            }}
          >
            결과만
          </button>
          <button
            onClick={() => handleSync("pull")}
            disabled={running}
            style={{
              padding: "10px 14px", borderRadius: 8, border: "1.5px solid #1B3A6B",
              background: running ? "#F1F5F9" : "#fff",
              color: running ? "#94A3B8" : "#1B3A6B", fontWeight: 700, fontSize: 12.5,
              cursor: running ? "not-allowed" : "pointer", whiteSpace: "nowrap",
            }}
          >
            공고만 (G2B 수집)
          </button>
        </div>
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
          position: "relative",
        }}>
          {/* 결과 적용 + 닫기 버튼 — 사용자가 읽고 직접 클릭 */}
          <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6 }}>
            <button
              onClick={handleApplyResults}
              style={{
                fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6,
                background: "#1B3A6B", color: "#fff", border: "none", cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              결과 적용 (페이지 갱신)
            </button>
            <button
              onClick={() => setSummary(null)}
              style={{
                fontSize: 11, padding: "4px 8px", borderRadius: 6,
                background: "transparent", color: "#64748B",
                border: "1px solid #CBD5E1", cursor: "pointer",
              }}
            >
              닫기
            </button>
          </div>
          {summary.ok ? (
            <>
              <strong>✓ 동기화 완료</strong>
              <span style={{ marginLeft: 8, fontSize: 10.5, color: "#94A3B8" }}>
                {(summary.elapsedMs / 1000).toFixed(1)}초 소요
              </span>
              {summary.pullElapsedMs > 0 && (
                <div style={{ marginTop: 4 }}>
                  G2B 수집 {summary.pullOk ? "✓" : "✗"} ({(summary.pullElapsedMs / 1000).toFixed(1)}초)
                  {summary.pullDetail && typeof summary.pullDetail === "object" && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: "#94A3B8" }}>
                      {(() => {
                        const d = summary.pullDetail as Record<string, unknown>;
                        const parts: string[] = [];
                        if (d.recentAnn != null) parts.push(`공고 ${d.recentAnn}건`);
                        if (d.recentBid != null) parts.push(`낙찰 ${d.recentBid}건`);
                        return parts.length ? `(${parts.join(", ")})` : null;
                      })()}
                    </span>
                  )}
                </div>
              )}
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
            <>
              <strong>✗ 동기화 부분 실패</strong>
              <span style={{ marginLeft: 8, fontSize: 10.5, color: "#94A3B8" }}>
                {(summary.elapsedMs / 1000).toFixed(1)}초 소요
              </span>
              {summary.error && (
                <div style={{ marginTop: 4, padding: "6px 8px", background: "#FEF2F2", borderRadius: 6, fontSize: 11.5, color: "#991B1B" }}>
                  실패 사유: {summary.error}
                </div>
              )}
              <div style={{ marginTop: 4 }}>
                G2B 수집 {summary.pullOk ? "✓" : "✗"} ({(summary.pullElapsedMs / 1000).toFixed(1)}초)
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
