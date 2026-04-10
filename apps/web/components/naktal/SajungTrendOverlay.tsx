"use client";

import { useEffect, useState } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { SajungTrendResponse } from "@/app/api/analysis/sajung-trend/route";

interface SajungTrendOverlayProps {
  annId: string;
  userId: string | null;
  predictedSajungRate?: number;
  period?: string;
  onLoad?: (sampleSize: number, fromCache: boolean) => void;
}

function StatCard({ label, value, sub, color = "#0F172A" }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "10px 14px", textAlign: "center", flex: 1 }}>
      <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #E8ECF2", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.value != null ? `${p.value}%` : "-"}
        </div>
      ))}
    </div>
  );
}

export function SajungTrendOverlay({ annId, userId, predictedSajungRate, period = "3y", onLoad }: SajungTrendOverlayProps) {
  const [data, setData] = useState<SajungTrendResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!annId) return;
    const qs = new URLSearchParams({ annId, period });
    if (userId) qs.set("userId", userId);
    setLoading(true);
    fetch(`/api/analysis/sajung-trend?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        const resp = d as SajungTrendResponse;
        setData(resp);
        onLoad?.(resp.orgCount, resp.fromCache ?? false);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [annId, userId, period]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div style={{ padding: "24px 0", textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
        발주처 사정율 흐름을 불러오는 중...
      </div>
    );
  }

  if (!data || data.orgCount === 0) {
    return (
      <div style={{ padding: "20px 0", textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "#94A3B8" }}>이 발주처의 사정율 흐름 데이터가 없습니다.</div>
      </div>
    );
  }

  const gapColor = data.gap === null ? "#64748B" : data.gap > 0 ? "#DC2626" : "#16A34A";
  const gapLabel = data.gap === null ? "-" : data.gap > 0 ? `+${data.gap}%p 높게 투찰` : `${data.gap}%p 낮게 투찰`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Stat Cards */}
      <div style={{ display: "flex", gap: 8 }}>
        <StatCard label="발주처 평균 사정율" value={data.orgAvg != null ? `${data.orgAvg}%` : "-"} sub={`${data.orgCount}건`} color="#1B3A6B" />
        <StatCard label="내 평균 사정율" value={data.mineAvg != null ? `${data.mineAvg}%` : "-"} sub={data.mineCount > 0 ? `${data.mineCount}건` : "이력 없음"} color="#F59E0B" />
        <StatCard label="차이" value={data.gap != null ? gapLabel : "-"} color={gapColor} />
      </div>

      {/* 내 투찰 이력 없음 안내 */}
      {data.mineCount === 0 && (
        <div style={{ padding: "10px 14px", background: "#F8FAFC", border: "1px solid #E8ECF2", borderRadius: 8, fontSize: 12, color: "#64748B" }}>
          💡 투찰 후 결과를 입력하면 내 사정율을 발주처 흐름과 비교할 수 있습니다.
        </div>
      )}

      {/* Chart */}
      <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "16px 8px 8px 8px" }}>
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8, paddingLeft: 8 }}>
          월별 사정율 흐름 · {data.orgCount.toLocaleString()}건
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={data.trend} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8ECF2" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#94A3B8" }}
              tickFormatter={(v: string) => v.slice(2)} // "YYYY-MM" → "YY-MM"
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#94A3B8" }}
              tickFormatter={(v: number) => `${v}%`}
              domain={["auto", "auto"]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              iconSize={10}
              wrapperStyle={{ fontSize: 11 }}
              formatter={(val) => val === "orgSajung" ? "발주처" : "내 투찰"}
            />
            {predictedSajungRate && (
              <ReferenceLine
                y={predictedSajungRate}
                stroke="#7C3AED"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                label={{ value: "AI추천", position: "right", fontSize: 10, fill: "#7C3AED" }}
              />
            )}
            <Line
              type="monotone"
              dataKey="orgSajung"
              stroke="#1B3A6B"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls={false}
              name="orgSajung"
            />
            {data.mineCount > 0 && (
              <Line
                type="monotone"
                dataKey="mineSajung"
                stroke="#F59E0B"
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={{ r: 3 }}
                connectNulls={false}
                name="mineSajung"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
