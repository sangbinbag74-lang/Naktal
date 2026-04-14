"use client";

import { useEffect, useState } from "react";
import {
  ComposedChart,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { SajungHistogramResponse } from "@/app/api/analysis/sajung-histogram/route";
import { formatDeviation, formatSajung, deviationColor } from "@/lib/format";

interface SajungHistogramProps {
  annId: string;
  predictedSajungRate?: number;
  lowerLimitRate?: number;
  period?: string;
  categoryFilter?: "same" | "all";
  orgScope?: "exact" | "expand";
  onLoad?: (sampleSize: number, fromCache: boolean) => void;
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, subColor, color = "#0F172A" }: {
  label: string; value: string; sub?: string; subColor?: string; color?: string;
}) {
  return (
    <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "10px 14px", textAlign: "center", flex: 1 }}>
      <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: subColor ?? "#94A3B8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label, orgAvg }: any) {
  if (!active || !payload?.length) return null;
  const bar = payload.find((p: any) => p.dataKey === "pct");
  const line = payload.find((p: any) => p.dataKey === "cumPct");
  const dev = typeof label === "number" && orgAvg != null ? formatDeviation(label, orgAvg) : "";
  return (
    <div style={{ background: "#fff", border: "1px solid #E8ECF2", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        {formatSajung(label)}{" "}
        <span style={{ fontSize: 10, color: "#94A3B8" }}>({dev})</span>
      </div>
      {bar && <div style={{ color: "#60A5FA" }}>빈도 {bar.value?.toFixed(1)}%</div>}
      {line && <div style={{ color: "#1B3A6B" }}>누적 {line.value?.toFixed(1)}%</div>}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SajungHistogram({ annId, predictedSajungRate, lowerLimitRate, period = "3y", categoryFilter = "same", orgScope = "expand", onLoad }: SajungHistogramProps) {
  const [data, setData] = useState<SajungHistogramResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!annId) return;
    setLoading(true);
    const qs = new URLSearchParams({ annId, period, categoryFilter, orgScope });
    fetch(`/api/analysis/sajung-histogram?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        const resp = d as SajungHistogramResponse;
        setData(resp);
        onLoad?.(resp.sampleSize, resp.fromCache ?? false);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [annId, period, categoryFilter, orgScope]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const filled = histogram.filter(h => h.count > 0);
  const xMin = Math.floor(((filled[0]?.rate ?? 97) * 10) - 5) / 10;
  const xMax = Math.ceil(((filled[filled.length - 1]?.rate ?? 103) * 10) + 5) / 10;
  const predicted = predictedSajungRate ?? stats.avg;
  const modeRate = stats.mode;
  const orgAvg = stats.avg; // 편차 기준값

  const modeDev = formatDeviation(stats.mode, orgAvg);
  const modeDevColor = deviationColor(stats.mode, orgAvg);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 유사 업종 확장 안내 배너 */}
      {data.expandedCategory && (
        <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#92400E", marginBottom: 0 }}>
          💡 동일 업종 데이터 부족으로 유사 업종({data.usedCategories?.join(", ")})을 포함하여 분석했습니다.
        </div>
      )}

      {/* 샘플 경고 배너 */}
      {sampleSize < 30 && (
        <div style={{ padding: "8px 12px", background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, fontSize: 12, color: "#92400E" }}>
          ⚠️ 표본 수가 적어 분포 정확도가 낮을 수 있습니다. ({sampleSize}건 기반)
        </div>
      )}

      {/* 두 봉우리 경고 배너 (전체업종 모드에서 분포 오염 가능성) */}
      {categoryFilter === "all" && stats.stddev > 3.0 && (
        <div style={{ padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, fontSize: 12, color: "#991B1B" }}>
          ⚠️ 분포 편차가 큽니다 (σ={stats.stddev.toFixed(1)}%). 업종이 혼재되어 두 봉우리가 나타날 수 있으니 <b>동일업종</b> 필터를 우선 참고하세요.
        </div>
      )}

      {/* AI 추천 정보 박스 (차트 위, 겹침 없음) */}
      {predictedSajungRate != null && (
        <div style={{
          display: "flex", gap: 12, alignItems: "center",
          padding: "8px 12px", background: "#EFF6FF",
          borderRadius: 8, border: "1px solid #BFDBFE", fontSize: 12,
        }}>
          <span style={{ color: "#1B3A6B", fontWeight: 600 }}>▌ AI 추천</span>
          <span style={{ color: "#1B3A6B", fontWeight: 700 }}>{formatSajung(predictedSajungRate)}</span>
          <span style={{ color: deviationColor(predictedSajungRate, orgAvg) }}>
            {formatDeviation(predictedSajungRate, orgAvg)}
          </span>
          <span style={{ color: "#94A3B8", marginLeft: "auto", fontSize: 11 }}>
            사정율 ±0.5% 구간 강조 표시
          </span>
        </div>
      )}

      {/* Stat Cards */}
      <div style={{ display: "flex", gap: 8 }}>
        <StatCard label="평균 사정율" value={formatSajung(stats.avg)} sub="기준값 (±0.000%)" color="#1B3A6B" />
        <StatCard label="최빈 사정율" value={formatSajung(stats.mode)} sub={modeDev} subColor={modeDevColor} color="#7C3AED" />
        <StatCard label="표준편차" value={`±${(stats.stddev ?? 0).toFixed(3)}%`} />
        <StatCard label="IQR 구간" value={`${formatSajung(stats.p25)}~${formatSajung(stats.p75)}`} />
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
              domain={[xMin, xMax]}
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
            <Tooltip content={<CustomTooltip orgAvg={orgAvg} />} />

            {/* AI 추천 참조선 */}
            <ReferenceLine
              yAxisId="left"
              x={Math.round(predicted * 10) / 10}
              stroke="#1B3A6B"
              strokeWidth={2.5}
            />
            {/* 최빈값 */}
            {modeRate !== Math.round(predicted * 10) / 10 && (
              <ReferenceLine
                yAxisId="left"
                x={modeRate}
                stroke="#7C3AED"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                label={{ value: `최빈 ${modeRate.toFixed(1)}%`, position: "top", fontSize: 10, fill: "#7C3AED" }}
              />
            )}
            {/* 낙찰하한율 */}
            {lr > 0 && lr >= xMin && lr <= xMax && (
              <ReferenceLine
                yAxisId="left"
                x={Math.round(lr * 10) / 10}
                stroke="#DC2626"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                label={{ value: `하한 ${lr.toFixed(1)}%`, position: "insideTopLeft", fontSize: 10, fill: "#DC2626" }}
              />
            )}

            {/* Bar — AI ±0.5% 구간 강조 */}
            <Bar yAxisId="left" dataKey="pct" radius={[2, 2, 0, 0]} name="빈도(%)">
              {histogram.map((entry) => {
                const isAi = Math.abs(entry.rate - predicted) <= 0.5;
                return (
                  <Cell
                    key={`cell-${entry.rate}`}
                    fill={isAi ? "#1B3A6B" : "#93C5FD"}
                    opacity={isAi ? 1 : 0.65}
                  />
                );
              })}
            </Bar>
            <Line yAxisId="right" type="monotone" dataKey="cumPct" stroke="#1B3A6B" strokeWidth={1.5} dot={false} name="누적(%)" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 실제 사정율 범위 */}
      <div style={{ fontSize: 11, color: "#64748B", paddingLeft: 4 }}>
        실제 사정율 범위: {(stats.min ?? stats.avg).toFixed(1)}% ~ {(stats.max ?? stats.avg).toFixed(1)}%
      </div>

      {/* 범례 */}
      <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#64748B", paddingLeft: 4 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 12, height: 10, background: "#1B3A6B", display: "inline-block", borderRadius: 2 }} />AI 추천 구간(±0.5%)
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 12, height: 3, background: "#7C3AED", display: "inline-block" }} />최빈값
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 12, height: 3, background: "#DC2626", display: "inline-block" }} />낙찰하한율
        </span>
      </div>
    </div>
  );
}
