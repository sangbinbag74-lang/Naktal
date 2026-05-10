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
import type { OrgPoint, SajungPredictions, SajungTrendResponse } from "@/app/api/analysis/sajung-trend/route";
import { formatDeviation, formatSajung, deviationColor } from "@/lib/format";

interface SajungTrendOverlayProps {
  annId: string;
  userId: string | null;
  predictedSajungRate?: number;
  budget?: number;
  lowerLimitRate?: number;
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

export function SajungTrendOverlay({ annId, userId, predictedSajungRate, budget, lowerLimitRate, period = "3y", categoryFilter = "same", orgScope = "expand", onLoad }: SajungTrendOverlayProps) {
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
        predCenter: null as number | null,
        predUpper: null as number | null,
        predLower: null as number | null,
      };
    });
  }, [data]);

  // 예측 점 포함 차트 데이터 (예측 있을 때 끝에 플레이스홀더 추가)
  const chartData = useMemo(() => {
    const pred = data?.predictions;
    if (!pred || mergedData.length === 0) return mergedData;
    const lastSeq = mergedData[mergedData.length - 1]?.seq ?? 0;
    return [
      ...mergedData,
      { seq: lastSeq + 3, sajung: null, date: "", mineSajung: null, predCenter: pred.center.sajung, predUpper: pred.upper.sajung, predLower: pred.lower.sajung },
    ];
  }, [mergedData, data?.predictions]);

  // Brush 선택 범위의 가시 데이터 (xTicks·Y domain 재계산용)
  const visibleData = useMemo(() => {
    const start = brushRange?.startIndex ?? 0;
    const end = brushRange?.endIndex ?? chartData.length - 1;
    return chartData.slice(start, end + 1);
  }, [chartData, brushRange]);

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

  // Y axis domain: ±1.5% 여유 (visibleData + 예측값 기준으로 동적 조정)
  const allY: number[] = visibleData.flatMap((d) => [
    d.sajung,
    d.predCenter,
    d.predUpper,
    d.predLower,
  ]).filter((v): v is number => v != null);
  const yMin = Math.max(85, Math.floor((Math.min(...allY) - 1.5) * 10) / 10);
  const yMax = Math.min(125, Math.ceil((Math.max(...allY) + 1.5) * 10) / 10);

  const N = data.orgCount;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 유사 업종 확장 안내 배너 */}
      {data.expandedCategory && (
        <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#92400E" }}>
          💡 동일 업종 데이터 부족으로 유사 업종({data.usedCategories?.join(", ")})을 포함하여 분석했습니다.
        </div>
      )}

      {/* A. 월별 사정율 추세 (메인 카드) */}
      <MonthlyTrendCard orgPoints={data.orgPoints} orgAvg={data.orgAvg ?? 100} />

      {/* C·F 보조 카드 (2 column) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <RecentTenCard orgPoints={data.orgPoints} orgAvg={data.orgAvg ?? 100} />
        <BiddersCorrCard orgPoints={data.orgPoints} />
      </div>

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
          <ComposedChart data={chartData} margin={{ top: 20, right: 20, left: -8, bottom: 20 }}>
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

            {/* 예측 중심 (◆ 진남색) */}
            {data.predictions && (
              <Line
                dataKey="predCenter"
                stroke="none"
                dot={(props: any) => {
                  if (props.value == null) return <g key={props.key} />;
                  return <polygon key={props.key} points={`${props.cx},${props.cy - 8} ${props.cx + 7},${props.cy} ${props.cx},${props.cy + 8} ${props.cx - 7},${props.cy}`} fill="#1B3A6B" />;
                }}
                isAnimationActive={false}
                legendType="none"
              />
            )}

            {/* 예측 상단 (▲ 빨강) */}
            {data.predictions && (
              <Line
                dataKey="predUpper"
                stroke="none"
                dot={(props: any) => {
                  if (props.value == null) return <g key={props.key} />;
                  return <polygon key={props.key} points={`${props.cx},${props.cy - 8} ${props.cx + 7},${props.cy + 6} ${props.cx - 7},${props.cy + 6}`} fill="#DC2626" />;
                }}
                isAnimationActive={false}
                legendType="none"
              />
            )}

            {/* 예측 하단 (▼ 초록) */}
            {data.predictions && (
              <Line
                dataKey="predLower"
                stroke="none"
                dot={(props: any) => {
                  if (props.value == null) return <g key={props.key} />;
                  return <polygon key={props.key} points={`${props.cx},${props.cy + 8} ${props.cx + 7},${props.cy - 6} ${props.cx - 7},${props.cy - 6}`} fill="#16A34A" />;
                }}
                isAnimationActive={false}
                legendType="none"
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
              endIndex={brushRange?.endIndex ?? chartData.length - 1}
              onChange={handleBrushChange}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ fontSize: 10, color: "#CBD5E1", textAlign: "center", marginTop: 4 }}>
          하단 막대를 드래그해서 기간을 확대할 수 있습니다
        </div>
      </div>

      {/* 예측 카드 */}
      {data.predictions && (
        <div style={{
          marginTop: 16,
          background: "#F8FAFC",
          borderRadius: 12,
          border: "1px solid #E2E8F0",
          overflow: "hidden",
        }}>
          {/* 헤더 */}
          <div style={{
            padding: "10px 16px",
            borderBottom: "1px solid #E2E8F0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
              다음 공고 예상 사정율
            </span>
            <span style={{ fontSize: 11, color: "#94A3B8" }}>
              {data.predictions.basis}
            </span>
          </div>

          {/* 카드 3개 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
            {[
              { pred: data.predictions.center, icon: "🎯", highlight: true  },
              { pred: data.predictions.upper,  icon: "📍", highlight: false },
              { pred: data.predictions.lower,  icon: "📍", highlight: false },
            ].map(({ pred, icon, highlight }, i) => {
              const bidPrice = budget && lowerLimitRate
                ? Math.round(budget * (pred.sajung / 100) * (lowerLimitRate / 100))
                : null;
              return (
                <div key={pred.label} style={{
                  padding: "14px 16px",
                  borderRight: i < 2 ? "1px solid #E2E8F0" : "none",
                  background: highlight ? "#EFF6FF" : "transparent",
                }}>
                  <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6 }}>
                    {icon} {pred.label}
                  </div>
                  <div style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: pred.deviation >= 0 ? "#1B3A6B" : "#DC2626",
                    letterSpacing: "-0.5px",
                  }}>
                    {pred.deviation >= 0 ? "+" : ""}{pred.deviation.toFixed(3)}%p
                  </div>
                  <div style={{ fontSize: 12, color: "#64748B", marginTop: 3 }}>
                    사정율 {pred.sajung.toFixed(3)}%
                  </div>
                  {bidPrice && (
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>
                      참고 {Math.round(bidPrice / 10000).toLocaleString()}만원
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 하단 기준 안내 */}
          <div style={{
            padding: "8px 16px",
            borderTop: "1px solid #E2E8F0",
            fontSize: 11,
            color: "#94A3B8",
          }}>
            ※ 발주처 평균 {data.orgAvg?.toFixed(3)}% 기준 편차
            · 통계적 참고자료, 낙찰 보장 없음
          </div>
        </div>
      )}
    </div>
  );
}

// ─── A. 월별 사정율 추세 카드 ────────────────────────────────────────────────
function MonthlyTrendCard({ orgPoints, orgAvg }: { orgPoints: OrgPoint[]; orgAvg: number }) {
  // 1~12월별 평균 사정율 계산
  const byMonth = new Map<number, number[]>();
  for (const p of orgPoints) {
    const m = parseInt(p.date.slice(5, 7), 10);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(p.sajung);
  }
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const arr = byMonth.get(m) ?? [];
    return { month: m, avg: arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null, count: arr.length };
  });
  const validAvgs = months.filter((m) => m.avg != null).map((m) => m.avg as number);
  const yMax = validAvgs.length > 0 ? Math.max(...validAvgs) : orgAvg + 0.5;
  const yMin = validAvgs.length > 0 ? Math.min(...validAvgs) : orgAvg - 0.5;
  const range = Math.max(yMax - yMin, 0.5);
  const currentMonth = new Date().getMonth() + 1;

  return (
    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>
        📅 월별 사정율 추세 <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 400 }}>(이번 달 강조)</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
        {months.map((m) => {
          const isThisMonth = m.month === currentMonth;
          const heightPct = m.avg != null ? ((m.avg - yMin) / range) * 100 : 0;
          const dev = m.avg != null ? m.avg - orgAvg : null;
          return (
            <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
                <div style={{
                  width: "100%",
                  height: m.avg != null ? `${Math.max(heightPct, 5)}%` : "0",
                  background: isThisMonth ? "#1B3A6B" : (dev != null && dev >= 0 ? "#60A5FA" : "#FCA5A5"),
                  borderRadius: "3px 3px 0 0",
                  transition: "all 0.2s",
                }} title={m.avg != null ? `${m.month}월 ${m.avg.toFixed(3)}% (${m.count}건)` : `${m.month}월 데이터 없음`} />
              </div>
              <div style={{ fontSize: 9, color: isThisMonth ? "#1B3A6B" : "#94A3B8", fontWeight: isThisMonth ? 700 : 400 }}>
                {m.month}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 8 }}>
        ※ 마우스 올리면 월별 평균 사정율 + 표본수 확인
      </div>
    </div>
  );
}

// ─── C. 최근 10건 시간순 추세 카드 ───────────────────────────────────────────
function RecentTenCard({ orgPoints, orgAvg }: { orgPoints: OrgPoint[]; orgAvg: number }) {
  const recent = [...orgPoints].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10).reverse();
  if (recent.length < 2) {
    return (
      <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>📈 최근 10건 추세</div>
        <div style={{ fontSize: 11, color: "#94A3B8" }}>데이터 부족</div>
      </div>
    );
  }
  const yMax = Math.max(...recent.map((p) => p.sajung));
  const yMin = Math.min(...recent.map((p) => p.sajung));
  const range = Math.max(yMax - yMin, 0.5);
  const last = recent[recent.length - 1]!;
  const first = recent[0]!;
  const dir = last.sajung > first.sajung ? "↑" : last.sajung < first.sajung ? "↓" : "→";
  const dirColor = last.sajung > first.sajung ? "#DC2626" : last.sajung < first.sajung ? "#2563EB" : "#94A3B8";

  return (
    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>📈 최근 10건 추세</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: dirColor }}>{dir}</span>
      </div>
      <div style={{ position: "relative", height: 60 }}>
        <svg viewBox={`0 0 100 100`} preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
          <polyline
            points={recent.map((p, i) => `${(i / (recent.length - 1)) * 100},${100 - ((p.sajung - yMin) / range) * 100}`).join(" ")}
            fill="none" stroke="#1B3A6B" strokeWidth="2" vectorEffect="non-scaling-stroke"
          />
          {recent.map((p, i) => (
            <circle key={i}
              cx={(i / (recent.length - 1)) * 100}
              cy={100 - ((p.sajung - yMin) / range) * 100}
              r="2" fill="#1B3A6B" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94A3B8", marginTop: 4 }}>
        <span>{first.date}</span>
        <span>평균 {(recent.reduce((s, p) => s + p.sajung, 0) / recent.length).toFixed(3)}% (orgAvg {orgAvg.toFixed(3)}%)</span>
        <span>{last.date}</span>
      </div>
    </div>
  );
}

// ─── F. 참여자 / 사정율 상관 카드 ────────────────────────────────────────────
function BiddersCorrCard({ orgPoints }: { orgPoints: OrgPoint[] }) {
  const withBidders = orgPoints.filter((p) => p.numBidders != null && p.numBidders > 0);
  if (withBidders.length < 5) {
    return (
      <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>👥 참여자 / 사정율 상관</div>
        <div style={{ fontSize: 11, color: "#94A3B8" }}>데이터 부족 (5건 이상 필요)</div>
      </div>
    );
  }
  // 그룹별 평균 (1~10 / 11~30 / 30+)
  const groups = [
    { label: "1~10명", filter: (n: number) => n <= 10 },
    { label: "11~30명", filter: (n: number) => n > 10 && n <= 30 },
    { label: "30+명", filter: (n: number) => n > 30 },
  ];
  const stats = groups.map((g) => {
    const arr = withBidders.filter((p) => g.filter(p.numBidders!));
    const avg = arr.length > 0 ? arr.reduce((s, p) => s + p.sajung, 0) / arr.length : null;
    return { label: g.label, avg, count: arr.length };
  });

  return (
    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>
        👥 참여자 / 사정율 상관
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
            <span style={{ color: "#64748B" }}>{s.label}</span>
            <span>
              {s.avg != null ? (
                <>
                  <strong style={{ color: "#0F172A" }}>{s.avg.toFixed(3)}%</strong>
                  <span style={{ color: "#94A3B8", marginLeft: 4 }}>({s.count}건)</span>
                </>
              ) : (
                <span style={{ color: "#CBD5E1" }}>-</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
