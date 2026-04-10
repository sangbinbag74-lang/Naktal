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
} from "recharts";
import type { OrgPoint, SajungTrendResponse } from "@/app/api/analysis/sajung-trend/route";
import { formatSajungDeviation, fmtSajungDiff } from "@/lib/format";

interface SajungTrendOverlayProps {
  annId: string;
  userId: string | null;
  predictedSajungRate?: number;
  period?: string;
  onLoad?: (sampleSize: number, fromCache: boolean) => void;
}

// ── 통계 카드 ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, dev, sub, color = "#0F172A" }: {
  label: string; value: string; dev?: string; sub?: string; color?: string;
}) {
  return (
    <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "10px 14px", textAlign: "center", flex: 1 }}>
      <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color }}>{value}</div>
      {dev && <div style={{ fontSize: 11, color: Number(dev[1]) >= 0 ? "#2563EB" : "#DC2626", marginTop: 2 }}>{dev}</div>}
      {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── 커스텀 툴팁 ───────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, seqToDate }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const date = seqToDate[d.seq] ?? "";
  return (
    <div style={{ background: "#fff", border: "1px solid #E8ECF2", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 4, color: "#64748B" }}>{date}</div>
      <div style={{ color: "#1B3A6B" }}>
        발주처 {d.sajung?.toFixed(3)}%
        {" "}
        <span style={{ color: "#94A3B8", fontSize: 11 }}>({formatSajungDeviation(d.sajung ?? 100)})</span>
      </div>
      {d.mineSajung != null && (
        <div style={{ color: "#F59E0B", marginTop: 2 }}>
          내 투찰 {d.mineSajung?.toFixed(3)}%
          {" "}
          <span style={{ color: "#94A3B8", fontSize: 11 }}>({formatSajungDeviation(d.mineSajung)})</span>
        </div>
      )}
    </div>
  );
}

// ── AI 참조선 레이블 ──────────────────────────────────────────────────────────

function AiLabel({ viewBox, rate }: { viewBox?: { x: number; y: number; width: number }; rate: number }) {
  if (!viewBox) return null;
  const { x, y, width } = viewBox;
  const lx = x + width - 4;
  const dev = rate - 100;
  const devStr = `${dev >= 0 ? "+" : ""}${dev.toFixed(1)}%p`;
  const label = `AI ${rate.toFixed(1)}%`;
  return (
    <g>
      <rect x={lx - 62} y={y - 26} width={64} height={24} fill="#1B3A6B" rx={4} />
      <text x={lx - 30} y={y - 14} textAnchor="middle" fill="#fff" fontSize={10} fontWeight={700}>{label}</text>
      <text x={lx - 30} y={y - 4} textAnchor="middle" fill="#93C5FD" fontSize={9}>{devStr}</text>
    </g>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

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

  // X 틱 formatter: seq → "YY-MM"
  const tickFormatter = (v: number) => {
    const date = seqToDate[Math.round(v)] ?? seqToDate[Object.keys(seqToDate).map(Number).reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a, 1)];
    return date ? date.slice(2) : "";
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

  const gapColor = data.gap === null ? "#64748B" : data.gap > 0 ? "#DC2626" : "#16A34A";
  const gapLabel = data.gap === null ? "-" : data.gap > 0 ? `+${data.gap}%p 높게 투찰` : `${data.gap}%p 낮게 투찰`;

  const orgDev = data.orgAvg != null ? formatSajungDeviation(data.orgAvg) : undefined;
  const mineDev = data.mineAvg != null && data.orgAvg != null
    ? `발주처 대비 ${fmtSajungDiff(data.mineAvg - data.orgAvg)}`
    : data.mineAvg != null ? formatSajungDeviation(data.mineAvg) : undefined;

  // Y axis domain: ±1.5%p 여유
  const allY = mergedData.map((d) => d.sajung);
  const yMin = Math.max(85, Math.floor((Math.min(...allY) - 1.5) * 10) / 10);
  const yMax = Math.min(125, Math.ceil((Math.max(...allY) + 1.5) * 10) / 10);

  const N = data.orgCount;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 통계 카드 */}
      <div style={{ display: "flex", gap: 8 }}>
        <StatCard
          label="발주처 평균 사정율"
          value={data.orgAvg != null ? `${data.orgAvg.toFixed(2)}%` : "-"}
          dev={orgDev}
          sub={`${data.orgCount}건`}
          color="#1B3A6B"
        />
        <StatCard
          label="내 평균 사정율"
          value={data.mineAvg != null ? `${data.mineAvg.toFixed(2)}%` : data.mineCount === 0 ? "이력 없음" : "-"}
          dev={data.mineCount > 0 ? mineDev : undefined}
          color="#F59E0B"
        />
        <StatCard label="차이" value={data.gap != null ? gapLabel : "-"} color={gapColor} />
      </div>

      {/* 투찰 이력 없음 안내 */}
      {data.mineCount === 0 && (
        <div style={{ padding: "10px 14px", background: "#F8FAFC", border: "1px solid #E8ECF2", borderRadius: 8, fontSize: 12, color: "#64748B" }}>
          💡 투찰 후 결과를 입력하면 내 사정율을 발주처 흐름과 비교할 수 있습니다.
        </div>
      )}

      {/* 차트 */}
      <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "16px 8px 8px 8px" }}>
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8, paddingLeft: 8 }}>
          건별 사정율 흐름 · {N.toLocaleString()}건
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={mergedData} margin={{ top: 20, right: 20, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8ECF2" vertical={false} />
            <XAxis
              dataKey="seq"
              type="number"
              domain={[1, N]}
              tick={{ fontSize: 10, fill: "#94A3B8" }}
              tickFormatter={tickFormatter}
              tickCount={6}
              allowDataOverflow={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#94A3B8" }}
              tickFormatter={(v: number) => `${v >= 100 ? "+" : ""}${(v - 100).toFixed(1)}%p`}
              domain={[yMin, yMax]}
              width={56}
            />
            <Tooltip content={<CustomTooltip seqToDate={seqToDate} />} />
            <Legend
              iconSize={10}
              wrapperStyle={{ fontSize: 11 }}
              formatter={(val) => val === "발주처" ? "발주처" : "내 투찰"}
            />

            {/* 평균선 */}
            {data.orgAvg != null && (
              <ReferenceLine
                y={data.orgAvg}
                stroke="#94A3B8"
                strokeWidth={1}
                strokeDasharray="4 3"
                label={{ value: `평균 ${data.orgAvg.toFixed(2)}%`, position: "insideBottomRight", fontSize: 9, fill: "#94A3B8" }}
              />
            )}

            {/* AI 추천선 */}
            {predictedSajungRate != null && (
              <ReferenceLine
                y={predictedSajungRate}
                stroke="#1B3A6B"
                strokeWidth={2.5}
                strokeDasharray="6 3"
                label={<AiLabel rate={predictedSajungRate} />}
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
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ fontSize: 10, color: "#CBD5E1", textAlign: "center", marginTop: 4 }}>
          Y축: 편차(%p) · 0%p = 기초금액과 동일
        </div>
      </div>
    </div>
  );
}
