"use client";

import { useEffect, useMemo, useState } from "react";
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
  Brush,
} from "recharts";
import type { OrgPoint, SajungTrendResponse } from "@/app/api/analysis/sajung-trend/route";
import { formatDeviation, formatSajung, deviationColor } from "@/lib/format";

interface SajungTrendOverlayProps {
  annId: string;
  userId: string | null;
  predictedSajungRate?: number;
  period?: string;
  categoryFilter?: "same" | "all";
  orgScope?: "exact" | "expand";
  onLoad?: (sampleSize: number, fromCache: boolean) => void;
}

// ── 통계 카드 ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, dev, devColor, sub, color = "#0F172A" }: {
  label: string; value: string; dev?: string; devColor?: string; sub?: string; color?: string;
}) {
  return (
    <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "10px 14px", textAlign: "center", flex: 1 }}>
      <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color }}>{value}</div>
      {dev && <div style={{ fontSize: 11, color: devColor ?? "#94A3B8", marginTop: 2 }}>{dev}</div>}
      {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── 커스텀 툴팁 ───────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, seqToDate, orgAvg }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const date = seqToDate[d.seq] ?? "";
  const avg = orgAvg ?? 100;
  return (
    <div style={{ background: "#fff", border: "1px solid #E8ECF2", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 4, color: "#64748B" }}>{date}</div>
      <div style={{ color: "#1B3A6B" }}>
        발주처 {formatSajung(d.sajung ?? 100)}
        {" "}
        <span style={{ color: "#94A3B8", fontSize: 11 }}>({formatDeviation(d.sajung ?? 100, avg)})</span>
      </div>
      {d.mineSajung != null && (
        <div style={{ color: "#F59E0B", marginTop: 2 }}>
          내 투찰 {formatSajung(d.mineSajung)}
          {" "}
          <span style={{ color: "#94A3B8", fontSize: 11 }}>({formatDeviation(d.mineSajung, avg)})</span>
        </div>
      )}
    </div>
  );
}

// ── AI 참조선 레이블 ──────────────────────────────────────────────────────────

function AiLabel({ viewBox, rate, orgAvg }: { viewBox?: { x: number; y: number; width: number }; rate: number; orgAvg: number }) {
  if (!viewBox) return null;
  const { x, y, width } = viewBox;
  const lx = x + width - 4;
  const label = `AI ${formatSajung(rate)}`;
  const devStr = formatDeviation(rate, orgAvg);
  return (
    <g>
      <rect x={lx - 72} y={y - 26} width={74} height={24} fill="#1B3A6B" rx={4} />
      <text x={lx - 35} y={y - 14} textAnchor="middle" fill="#fff" fontSize={10} fontWeight={700}>{label}</text>
      <text x={lx - 35} y={y - 4} textAnchor="middle" fill="#93C5FD" fontSize={9}>{devStr}</text>
    </g>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export function SajungTrendOverlay({ annId, userId, predictedSajungRate, period = "3y", categoryFilter = "same", orgScope = "exact", onLoad }: SajungTrendOverlayProps) {
  const [data, setData] = useState<SajungTrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [brushRange, setBrushRange] = useState<{ startIndex: number; endIndex: number } | null>(null);

  // data 변경 시 brushRange 초기화
  useEffect(() => { setBrushRange(null); }, [data]);

  useEffect(() => {
    if (!annId) return;
    const qs = new URLSearchParams({ annId, period, categoryFilter, orgScope });
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
  }, [annId, userId, period, categoryFilter, orgScope]); // eslint-disable-line react-hooks/exhaustive-deps

  // seq → date 매핑
  const seqToDate = useMemo(() => {
    const map: Record<number, string> = {};
    for (const p of data?.orgPoints ?? []) map[p.seq] = p.date;
    return map;
  }, [data]);

  // 발주처 점 + 내 투찰 병합
  const mergedData = useMemo(() => {
    if (!data) return [];
    return data.orgPoints.map((p: OrgPoint) => {
      const mine = data.myPoints.find((m) =>
        Math.abs(new Date(m.date + "-01").getTime() - new Date(p.date + "-01").getTime()) < 30 * 24 * 3600 * 1000
      );
      return {
        seq: p.seq,
        sajung: p.sajung,
        date: p.date,
        mineSajung: mine?.sajung ?? null,
      };
    });
  }, [data]);

  // Brush 선택 범위의 가시 데이터 (xTicks·Y domain 재계산용)
  const visibleData = useMemo(() => {
    const start = brushRange?.startIndex ?? 0;
    const end = brushRange?.endIndex ?? mergedData.length - 1;
    return mergedData.slice(start, end + 1);
  }, [mergedData, brushRange]);

  // X 틱 계산: 최대 5개, "24년3월" 형식 (visibleData 기준)
  const xTicks = useMemo(() => {
    const total = visibleData.length;
    if (total === 0) return [];
    const step = Math.max(1, Math.floor(total / 5));
    const ticks = visibleData
      .filter((_, i) => i % step === 0 || i === total - 1)
      .map((d) => d.seq);
    return [...new Set(ticks)].slice(0, 6);
  }, [visibleData]);

  const tickFormatter = (v: number) => {
    const nearest = visibleData.reduce<typeof visibleData[0] | null>((best, d) =>
      best === null || Math.abs(d.seq - v) < Math.abs(best.seq - v) ? d : best, null);
    if (!nearest) return "";
    const parts = nearest.date.split("-");
    return `${(parts[0] ?? "").slice(2)}년${parseInt(parts[1] ?? "0")}월`;
  };

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

  // 통계 카드 값
  const baseAvg = data.orgAvg ?? 100; // 편차 기준값
  const orgAvgStr = data.orgAvg != null ? formatSajung(data.orgAvg) : "-";

  const mineAvgStr = data.mineAvg != null
    ? formatSajung(data.mineAvg)
    : data.mineCount === 0 ? "이력 없음" : "-";
  const mineDev = data.mineAvg != null ? formatDeviation(data.mineAvg, baseAvg) : undefined;
  const mineDevColor = data.mineAvg != null ? deviationColor(data.mineAvg, baseAvg) : undefined;

  const gap = data.mineAvg != null && data.orgAvg != null ? data.mineAvg - data.orgAvg : null;
  const gapStr = gap != null
    ? `${gap >= 0 ? "+" : ""}${gap.toFixed(3)}%`
    : "-";
  const gapColor = gap === null ? "#64748B" : gap > 0 ? "#DC2626" : "#16A34A";

  const handleBrushChange = (range: { startIndex?: number; endIndex?: number }) => {
    if (
      range.startIndex !== undefined &&
      range.endIndex !== undefined &&
      range.endIndex > range.startIndex
    ) {
      setBrushRange({ startIndex: range.startIndex, endIndex: range.endIndex });
    }
  };

  // Y axis domain: ±1.5% 여유 (visibleData 기준으로 동적 조정)
  const allY = visibleData.map((d: { sajung: number }) => d.sajung);
  const yMin = Math.max(85, Math.floor((Math.min(...allY) - 1.5) * 10) / 10);
  const yMax = Math.min(125, Math.ceil((Math.max(...allY) + 1.5) * 10) / 10);

  const N = data.orgCount;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 자동 expand 안내 배너 */}
      {data.autoExpanded && (
        <div style={{ padding: "8px 12px", background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 8, fontSize: 12, color: "#9A3412" }}>
          📡 동일 발주처 데이터가 부족해 유사 기관명까지 확장 검색했습니다.
        </div>
      )}

      {/* 통계 카드 */}
      <div style={{ display: "flex", gap: 8 }}>
        <StatCard
          label="발주처 평균 사정율"
          value={orgAvgStr}
          dev="기준값 (±0.000%)"
          sub={`${data.orgCount}건`}
          color="#1B3A6B"
        />
        <StatCard
          label="내 평균 사정율"
          value={mineAvgStr}
          dev={data.mineCount > 0 ? mineDev : undefined}
          devColor={mineDevColor}
          color="#F59E0B"
        />
        <StatCard label="차이" value={gapStr} color={gapColor} />
      </div>

      {/* 투찰 이력 없음 안내 */}
      {data.mineCount === 0 && (
        <div style={{ padding: "10px 14px", background: "#F8FAFC", border: "1px solid #E8ECF2", borderRadius: 8, fontSize: 12, color: "#64748B" }}>
          💡 투찰 후 결과를 입력하면 내 사정율을 발주처 흐름과 비교할 수 있습니다.
        </div>
      )}

      {/* 차트 */}
      <style>{`
        .recharts-brush-traveller rect { fill: #1B3A6B !important; stroke: #1B3A6B !important; }
        .recharts-brush-traveller line { stroke: white !important; }
      `}</style>
      <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "16px 8px 8px 8px" }}>
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8, paddingLeft: 8 }}>
          건별 사정율 흐름 · {N.toLocaleString()}건
        </div>
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={mergedData} margin={{ top: 20, right: 20, left: -8, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8ECF2" vertical={false} />
            <XAxis
              dataKey="seq"
              type="number"
              domain={[visibleData[0]?.seq ?? 1, visibleData[visibleData.length - 1]?.seq ?? N]}
              ticks={xTicks}
              tick={{ fontSize: 10, fill: "#94A3B8" }}
              tickFormatter={tickFormatter}
              tickLine={false}
              allowDataOverflow={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#94A3B8" }}
              tickFormatter={(v: number) => formatDeviation(v, baseAvg)}
              domain={[yMin, yMax]}
              width={62}
            />
            <Tooltip content={<CustomTooltip seqToDate={seqToDate} orgAvg={baseAvg} />} />
            <Legend
              iconSize={10}
              wrapperStyle={{ fontSize: 11 }}
              formatter={(val) => (
                <span style={{ color: "#0F172A" }}>{val === "발주처" ? "발주처" : "내 투찰"}</span>
              )}
            />

            {/* 평균선 */}
            {data.orgAvg != null && (
              <ReferenceLine
                y={data.orgAvg}
                stroke="#94A3B8"
                strokeWidth={1}
                strokeDasharray="4 3"
                label={
                  predictedSajungRate != null && Math.abs(predictedSajungRate - data.orgAvg) <= 0.5
                    ? undefined
                    : { value: `평균 ${formatSajung(data.orgAvg)}`, position: "insideBottomLeft", fontSize: 9, fill: "#94A3B8" }
                }
              />
            )}

            {/* AI 추천선 */}
            {predictedSajungRate != null && (
              <ReferenceLine
                y={predictedSajungRate}
                stroke="#1B3A6B"
                strokeWidth={2.5}
                strokeDasharray="6 3"
                label={<AiLabel rate={predictedSajungRate} orgAvg={baseAvg} />}
              />
            )}

            {/* 발주처 꺾은선 */}
            <Line
              type="monotone"
              dataKey="sajung"
              stroke="#60A5FA"
              strokeWidth={1}
              dot={{ r: 2, fill: "#60A5FA", strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              connectNulls={false}
              name="발주처"
              isAnimationActive={false}
            />

            {/* 내 투찰 (도트만, 선 없음) */}
            {data.mineCount > 0 && (
              <Line
                dataKey="mineSajung"
                stroke="none"
                dot={{ r: 6, fill: "#F59E0B", strokeWidth: 2, stroke: "#fff" }}
                activeDot={{ r: 8 }}
                connectNulls={false}
                name="내 투찰"
                isAnimationActive={false}
              />
            )}

            {/* 드래그 확대 Brush (onChange → visibleData 재계산) */}
            <Brush
              dataKey="seq"
              height={44}
              stroke="#94A3B8"
              fill="#F1F5F9"
              travellerWidth={12}
              gap={2}
              tickFormatter={() => ""}
              startIndex={brushRange?.startIndex ?? 0}
              endIndex={brushRange?.endIndex ?? mergedData.length - 1}
              onChange={handleBrushChange}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ fontSize: 10, color: "#CBD5E1", textAlign: "center", marginTop: 4 }}>
          하단 막대를 드래그해서 기간을 확대할 수 있습니다
        </div>
      </div>
    </div>
  );
}
