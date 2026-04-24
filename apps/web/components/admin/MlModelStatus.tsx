"use client";

import { useEffect, useState } from "react";

interface ModelStatus {
  status: "ok" | "error" | "loading";
  model_version?: string;
  feature_count?: number;
  loaded_boosters?: number;
  metrics?: Record<string, number>;
  error?: string;
}

interface ModelCard {
  name: string;
  endpoint: string;
  description: string;
}

const MODELS: ModelCard[] = [
  {
    name: "Model 1 · 사정율 예측",
    endpoint: "/api/ml-predict",
    description: "CORE 1 LightGBM, 27 피처 (A값/기초금액/사전규격 포함)",
  },
  {
    name: "Model 2 · 복수예가 번호 선택",
    endpoint: "/api/ml-predict-numbers",
    description: "CORE 2 15개 LightGBM binary, BidOpeningDetail 학습",
  },
  // Model 3 (참여자수) — 배포 포기 (RMSE 59명 실용 불가, 2026-04-24)
  //   project_ml_model3_abandoned.md 참조
];

export function MlModelStatus() {
  const [statuses, setStatuses] = useState<(ModelStatus & { endpoint: string })[]>(
    MODELS.map((m) => ({ endpoint: m.endpoint, status: "loading" })),
  );

  useEffect(() => {
    Promise.all(
      MODELS.map(async (m) => {
        try {
          const r = await fetch(m.endpoint, { method: "GET", signal: AbortSignal.timeout(5000) });
          const data = (await r.json()) as ModelStatus;
          return { ...data, endpoint: m.endpoint };
        } catch (e) {
          return {
            endpoint: m.endpoint,
            status: "error" as const,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }),
    ).then(setStatuses);
  }, []);

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 14 }}>
        ML 모델 상태
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        {MODELS.map((m, i) => {
          const s = statuses[i];
          const ok = s?.status === "ok";
          const loading = s?.status === "loading";
          const color = ok ? "#059669" : loading ? "#D97706" : "#DC2626";
          return (
            <div
              key={m.endpoint}
              style={{
                background: "#F8FAFC",
                borderRadius: 10,
                border: "1px solid #E8ECF2",
                padding: "14px 16px",
                borderLeft: `4px solid ${color}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{m.name}</div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color,
                    background: `${color}1a`,
                    padding: "2px 7px",
                    borderRadius: 4,
                  }}
                >
                  {loading ? "확인 중" : ok ? "활성" : "오류"}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8, lineHeight: 1.5 }}>{m.description}</div>

              {ok && (
                <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.6 }}>
                  {s.model_version && <div>ver: <code style={{ color: "#1B3A6B" }}>{s.model_version}</code></div>}
                  {s.feature_count != null && <div>피처: {s.feature_count}개</div>}
                  {s.loaded_boosters != null && <div>부스터: {s.loaded_boosters}/15</div>}
                  {s.metrics && Object.keys(s.metrics).length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      {Object.entries(s.metrics).map(([k, v]) => (
                        <div key={k} style={{ fontSize: 10, color: "#6B7280" }}>
                          {k}: <span style={{ color: "#1B3A6B", fontWeight: 600 }}>{Number(v).toFixed(4)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!ok && !loading && (
                <div style={{ fontSize: 10, color: "#DC2626", marginTop: 4 }}>
                  {s?.error?.slice(0, 80) ?? "응답 없음"}
                </div>
              )}

              <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 6 }}>
                <code>{m.endpoint}</code>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
