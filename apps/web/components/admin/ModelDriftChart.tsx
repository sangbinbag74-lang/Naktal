"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { DriftPoint } from "@/lib/admin/model-eval";

const SERIES = [
  { key: "sajung_v2.mae_test",  name: "사정율 MAE",       color: "#1B3A6B" },
  { key: "opening.top4_test",   name: "복수예가 top4",    color: "#059669" },
  { key: "participants.rmse_test", name: "참여자 RMSE (폐기)", color: "#94A3B8" },
];

export function ModelDriftChart({ points }: { points: DriftPoint[] }) {
  const data = points.map((p) => {
    const row: Record<string, string | number> = {
      label: new Date(p.generated_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" }),
    };
    for (const [model, metrics] of Object.entries(p.values)) {
      for (const [m, v] of Object.entries(metrics)) row[`${model}.${m}`] = v;
    }
    return row;
  });

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>학습 지표 추이 (drift)</div>
      <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 14 }}>
        {data.length}회 학습 누적. 매주 retrain-all.ps1 실행 시 한 점씩 추가.
      </div>
      {data.length === 0 ? (
        <div style={{ fontSize: 12, color: "#9CA3AF", padding: 20 }}>이력 없음</div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 5, right: 16, bottom: 5, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8ECF2" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748B" }} />
            <YAxis tick={{ fontSize: 11, fill: "#64748B" }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {SERIES.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={{ r: 3 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
