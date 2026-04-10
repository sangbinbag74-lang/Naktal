"use client";

import { useEffect, useState } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { SajungTrendResponse } from "@/app/api/analysis/sajung-trend/route";
import { fmtSajungDiff } from "@/lib/format";

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

function xToLabel(x: number): string {
  const year = Math.floor(x / 12);
  const month = x % 12;
  return `${String(year).slice(2)}-${String(month).padStart(2, "0")}`;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const pt = payload[0];
  if (!pt) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #E8ECF2", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 4, color: pt.fill }}>{pt.name}</div>
      <div>{xToLabel(pt.payload.x)}</div>
      <div>사정율 {pt.payload.y.toFixed(2)}%</div>
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

  // Y-axis domain: pad ±1%p around data range
  const allY = [...(data.orgPoints ?? []), ...(data.myPoints ?? [])].map((p) => p.y);
  const yMin = allY.length ? Math.floor((Math.min(...allY) - 1) * 10) / 10 : 95;
  const yMax = allY.length ? Math.ceil((Math.max(...allY) + 1) * 10) / 10 : 115;

  // X-axis domain
  const allX = [...(data.orgPoints ?? []), ...(data.myPoints ?? [])].map((p) => p.x);
  const xMin = allX.length ? Math.min(...allX) - 1 : 0;
  const xMax = allX.length ? Math.max(...allX) + 1 : 1;

  // 내 평균 vs 발주처 평균 편차
  const mineDiffLabel = data.mineAvg != null && data.orgAvg != null
    ? `발주처 대비 ${fmtSajungDiff(data.mineAvg - data.orgAvg)}`
    : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Stat Cards */}
      <div style={{ display: "flex", gap: 8 }}>
        <StatCard
          label="발주처 평균 사정율"
          value={data.orgAvg != null ? `${data.orgAvg.toFixed(2)}%` : "-"}
          sub={`${data.orgCount}건`}
          color="#1B3A6B"
        />
        <StatCard
          label="내 평균 사정율"
          value={data.mineAvg != null ? `${data.mineAvg.toFixed(2)}%` : "-"}
          sub={data.mineCount > 0 ? mineDiffLabel ?? `${data.mineCount}건` : "이력 없음"}
          color="#F59E0B"
        />
        <StatCard label="차이" value={data.gap != null ? gapLabel : "-"} color={gapColor} />
      </div>

      {/* 내 투찰 이력 없음 안내 */}
      {data.mineCount === 0 && (
        <div style={{ padding: "10px 14px", background: "#F8FAFC", border: "1px solid #E8ECF2", borderRadius: 8, fontSize: 12, color: "#64748B" }}>
          💡 투찰 후 결과를 입력하면 내 사정율을 발주처 흐름과 비교할 수 있습니다.
        </div>
      )}

      {/* Scatter Chart */}
      <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "16px 8px 8px 8px" }}>
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8, paddingLeft: 8 }}>
          건별 사정율 산점도 · {data.orgCount.toLocaleString()}건
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <ScatterChart margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8ECF2" />
            <XAxis
              dataKey="x"
              type="number"
              domain={[xMin, xMax]}
              tick={{ fontSize: 10, fill: "#94A3B8" }}
              tickFormatter={xToLabel}
              tickCount={6}
              name="날짜"
            />
            <YAxis
              dataKey="y"
              type="number"
              domain={[yMin, yMax]}
              tick={{ fontSize: 10, fill: "#94A3B8" }}
              tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              name="사정율"
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              iconSize={10}
              wrapperStyle={{ fontSize: 11 }}
              formatter={(val) => val === "발주처" ? "발주처" : "내 투찰"}
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
            {data.orgAvg != null && (
              <ReferenceLine
                y={data.orgAvg}
                stroke="#1B3A6B"
                strokeWidth={1}
                strokeDasharray="4 3"
                label={{ value: `평균 ${data.orgAvg.toFixed(2)}%`, position: "insideTopLeft", fontSize: 9, fill: "#1B3A6B" }}
              />
            )}
            <Scatter
              data={data.orgPoints ?? []}
              fill="#60A5FA"
              opacity={0.55}
              name="발주처"
              r={3}
            />
            {data.mineCount > 0 && (
              <Scatter
                data={data.myPoints ?? []}
                fill="#F59E0B"
                opacity={0.85}
                name="내 투찰"
                r={5}
              />
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
