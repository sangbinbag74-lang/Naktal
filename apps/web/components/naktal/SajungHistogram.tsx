"use client";

import { useEffect, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { SajungHistogramResponse, HistogramBucket } from "@/app/api/analysis/sajung-histogram/route";
import { fmtSajungDiff } from "@/lib/format";

interface SajungHistogramProps {
  annId: string;
  predictedSajungRate?: number;
  lowerLimitRate?: number;
  period?: string;
  onLoad?: (sampleSize: number, fromCache: boolean) => void;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.round(n)) + "원";
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = "#0F172A" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "10px 14px", textAlign: "center", flex: 1 }}>
      <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const bar = payload.find((p: any) => p.dataKey === "pct");
  const line = payload.find((p: any) => p.dataKey === "cumPct");
  return (
    <div style={{ background: "#fff", border: "1px solid #E8ECF2", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>사정율 {label}%</div>
      {bar && <div style={{ color: "#60A5FA" }}>빈도 {bar.value?.toFixed(1)}%</div>}
      {line && <div style={{ color: "#1B3A6B" }}>누적 {line.value?.toFixed(1)}%</div>}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SajungHistogram({ annId, predictedSajungRate, lowerLimitRate, period = "3y", onLoad }: SajungHistogramProps) {
  const [data, setData] = useState<SajungHistogramResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!annId) return;
    setLoading(true);
    const qs = new URLSearchParams({ annId, period });
    fetch(`/api/analysis/sajung-histogram?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        const resp = d as SajungHistogramResponse;
        setData(resp);
        onLoad?.(resp.sampleSize, resp.fromCache ?? false);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [annId, period]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div style={{ padding: "24px 0", textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
        사정율 분포 데이터를 불러오는 중...
      </div>
    );
  }

  if (!data || data.sampleSize === 0) {
    return (
      <div style={{ padding: "20px 0", textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "#94A3B8" }}>이 발주처의 사정율 분포 데이터가 없습니다.</div>
        <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4 }}>낙찰 결과 데이터가 쌓이면 자동으로 표시됩니다.</div>
      </div>
    );
  }

  const { histogram, sampleSize, stats } = data;
  const lr = lowerLimitRate ?? data.lowerLimitRate;
  const predicted = predictedSajungRate ?? stats.avg;

  // Mode bucket rate
  const modeRate = stats.mode;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 샘플 경고 배너 */}
      {sampleSize < 30 && (
        <div style={{
          padding: "8px 12px",
          background: "#FFFBEB",
          border: "1px solid #FCD34D",
          borderRadius: 8,
          fontSize: 12,
          color: "#92400E",
        }}>
          ⚠️ 표본 수가 적어 분포 정확도가 낮을 수 있습니다. ({sampleSize}건 기반)
        </div>
      )}

      {/* Stat Cards */}
      <div style={{ display: "flex", gap: 8 }}>
        <StatCard label="평균 사정율" value={`${stats.avg.toFixed(2)}%`} color="#1B3A6B" />
        <StatCard label="최빈 사정율" value={`${stats.mode.toFixed(1)}%`} sub={fmtSajungDiff(stats.mode - stats.avg)} color="#7C3AED" />
        <StatCard label="표준편차" value={`±${stats.stddev.toFixed(2)}%p`} />
        <StatCard label="IQR 구간" value={`${stats.p25.toFixed(1)}~${stats.p75.toFixed(1)}%`} />
      </div>

      {/* Chart */}
      <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "16px 8px 8px 8px" }}>
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8, paddingLeft: 8 }}>
          사정율 분포 히스토그램 · {sampleSize.toLocaleString()}건
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={histogram} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8ECF2" vertical={false} />
            <XAxis
              dataKey="rate"
              type="number"
              domain={[
                Math.max(85, Math.floor((histogram[0]?.rate ?? 85) * 10 - 10) / 10),
                Math.min(125, Math.ceil((histogram[histogram.length - 1]?.rate ?? 125) * 10 + 10) / 10),
              ]}
              tick={{ fontSize: 10, fill: "#94A3B8" }}
              tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              tickCount={8}
              allowDataOverflow={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10, fill: "#94A3B8" }}
              tickFormatter={(v: number) => `${v}%`}
              domain={[0, "auto"]}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: "#94A3B8" }}
              tickFormatter={(v: number) => `${v}%`}
              domain={[0, 100]}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* AI 추천 사정율 */}
            <ReferenceLine
              yAxisId="left"
              x={Math.round(predicted * 10) / 10}
              stroke="#1B3A6B"
              strokeWidth={2}
              label={{ value: "AI추천", position: "top", fontSize: 10, fill: "#1B3A6B" }}
            />
            {/* 최빈값 */}
            {modeRate !== Math.round(predicted * 10) / 10 && (
              <ReferenceLine
                yAxisId="left"
                x={modeRate}
                stroke="#7C3AED"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                label={{ value: "최빈", position: "top", fontSize: 10, fill: "#7C3AED" }}
              />
            )}
            {/* 낙찰하한율 */}
            {lr > 0 && (
              <ReferenceLine
                yAxisId="left"
                x={Math.round(lr * 10) / 10}
                stroke="#DC2626"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                label={{ value: "하한", position: "top", fontSize: 10, fill: "#DC2626" }}
              />
            )}

            <Bar yAxisId="left" dataKey="pct" fill="#60A5FA" opacity={0.75} radius={[2, 2, 0, 0]} name="빈도(%)" />
            <Line yAxisId="right" type="monotone" dataKey="cumPct" stroke="#1B3A6B" strokeWidth={1.5} dot={false} name="누적(%)" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 범례 */}
      <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#64748B", paddingLeft: 4 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 12, height: 3, background: "#1B3A6B", display: "inline-block" }} />AI 추천
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 12, height: 3, background: "#7C3AED", display: "inline-block", borderTop: "1px dashed #7C3AED" }} />최빈값
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 12, height: 3, background: "#DC2626", display: "inline-block", borderTop: "1px dashed #DC2626" }} />낙찰하한율
        </span>
      </div>
    </div>
  );
}
