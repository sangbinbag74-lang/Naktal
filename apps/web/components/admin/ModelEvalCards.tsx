import type { ModelEval } from "@/lib/admin/model-eval";

const LABELS: Record<string, { name: string; metric: string; lower: boolean; unit: string }> = {
  sajung_v2:    { name: "Model 1 · 사정율 v2",        metric: "mae_test",  lower: true,  unit: "%p" },
  opening:      { name: "Model 2 · 복수예가 (top4)",  metric: "top4_test", lower: false, unit: "" },
  participants: { name: "Model 3 · 참여자수 (폐기)",   metric: "rmse_test", lower: true,  unit: "명" },
};

export function ModelEvalCards({ evaluation }: { evaluation: ModelEval | null }) {
  if (!evaluation) {
    return (
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>학습 평가 지표</div>
        <div style={{ fontSize: 12, color: "#9CA3AF" }}>evaluation.json 없음 — apps/ml/retrain-all.ps1 또는 evaluate_models.py 실행 필요</div>
      </div>
    );
  }
  const generated = new Date(evaluation.generated_at);
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>학습 평가 지표</div>
        <div style={{ fontSize: 11, color: "#94A3B8" }}>
          {generated.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })} 생성
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {Object.entries(evaluation.models).map(([key, entry]) => {
          const label = LABELS[key];
          if (!label) return null;
          const m = entry.metrics ?? {};
          const primary = m[label.metric];
          const isAbandoned = key === "participants";
          return (
            <div key={key} style={{
              background: "#F8FAFC",
              border: `1px solid ${isAbandoned ? "#FCA5A5" : "#E8ECF2"}`,
              borderRadius: 10,
              padding: "14px 16px",
              opacity: isAbandoned ? 0.6 : 1,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>
                {label.name}
              </div>
              <div style={{ fontSize: 10, color: "#64748B", marginBottom: 8 }}>
                {entry.model_version ?? "?"} · 피처 {entry.feature_count ?? 0}개
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 10, color: "#94A3B8" }}>{label.metric}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#1B3A6B" }}>
                    {primary != null ? `${primary.toFixed(4)}${label.unit}` : "-"}
                  </div>
                </div>
                {Object.entries(m)
                  .filter(([k]) => k !== label.metric)
                  .slice(0, 2)
                  .map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontSize: 10, color: "#94A3B8" }}>{k}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{v.toFixed(4)}</div>
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
