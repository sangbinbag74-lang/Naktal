"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

interface ByCategoryItem { category: string; avgRate: number; count: number; }
interface DistributionItem { range: string; count: number; }
interface ByNumBiddersItem { numBidders: number; avgRate: number; }
interface StatsData {
  byCategory: ByCategoryItem[];
  distribution: DistributionItem[];
  byNumBidders: ByNumBiddersItem[];
  total: number;
}

const NAVY = "#1B3A6B";
const ACCENT = "#60A5FA";

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  border: "1px solid #E8ECF2",
  padding: "24px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={cardStyle}>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "#111827", margin: 0 }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function SkeletonBar() {
  return (
    <div style={{ height: 14, borderRadius: 7, background: "#E8ECF2", marginBottom: 8, animationName: "pulse" }} />
  );
}

export default function AnalysisPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setSyncing(true);
    fetch("/api/analysis/bid-rate-stats")
      .then((r) => r.json())
      .then((d: StatsData) => setData(d))
      .catch(() => console.error("통계 로드 실패"))
      .finally(() => { setLoading(false); setSyncing(false); });
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "0 4px" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ height: 28, width: 120, borderRadius: 8, background: "#E8ECF2", marginBottom: 8 }} />
          <div style={{ height: 16, width: 240, borderRadius: 6, background: "#F3F4F6" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={cardStyle}>
              <div style={{ height: 20, width: 200, borderRadius: 6, background: "#E8ECF2", marginBottom: 20 }} />
              <div style={{ height: 280, borderRadius: 8, background: "#F9FAFB" }}>
                {[...Array(5)].map((_, j) => <SkeletonBar key={j} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ ...cardStyle, padding: "64px 24px", textAlign: "center", color: "#9CA3AF" }}>
        데이터를 불러올 수 없습니다.
      </div>
    );
  }

  const isEmpty = data.byCategory.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* 페이지 헤더 */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>투찰 분석</h2>
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4, marginBottom: 0 }}>
            낙찰 결과 데이터 기반 투찰률 통계
            {data.total > 0 && (
              <span style={{
                marginLeft: 8, fontSize: 12, background: "#EFF6FF",
                color: NAVY, padding: "2px 8px", borderRadius: 20, fontWeight: 600,
              }}>
                {data.total.toLocaleString()}건
              </span>
            )}
          </p>
        </div>
        {syncing && (
          <span style={{ fontSize: 12, color: "#60A5FA" }}>나라장터에서 데이터 수집 중...</span>
        )}
      </div>

      {/* 빈 상태 */}
      {isEmpty && (
        <div style={{
          ...cardStyle, padding: "64px 24px", textAlign: "center",
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
            분석할 낙찰 결과 데이터가 없습니다
          </p>
          <p style={{ fontSize: 13, color: "#9CA3AF" }}>
            나라장터에서 데이터를 자동으로 수집합니다. 잠시 후 다시 시도해주세요.
          </p>
        </div>
      )}

      {/* 차트 1: 업종별 평균 낙찰 투찰률 */}
      {data.byCategory.length > 0 && (
        <ChartCard title="업종별 평균 낙찰 투찰률">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.byCategory.slice(0, 12)} margin={{ top: 5, right: 20, bottom: 60, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis
                dataKey="category"
                tick={{ fontSize: 11, fill: "#6B7280" }}
                angle={-30}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 11, fill: "#6B7280" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v) => [`${Number(v).toFixed(2)}%`, "평균 투찰률"]}
                contentStyle={{ borderRadius: 8, border: "1px solid #E8ECF2", fontSize: 12 }}
              />
              <Bar dataKey="avgRate" radius={[6, 6, 0, 0]}>
                {data.byCategory.slice(0, 12).map((_, i) => (
                  <Cell key={i} fill={i % 2 === 0 ? NAVY : ACCENT} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* 차트 2: 투찰률 분포 히스토그램 */}
      {data.distribution.length > 0 && (
        <ChartCard title="투찰률 구간별 낙찰 건수 분포">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.distribution} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="range" tick={{ fontSize: 10, fill: "#6B7280" }} />
              <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v) => [`${Number(v)}건`, "낙찰 건수"]}
                contentStyle={{ borderRadius: 8, border: "1px solid #E8ECF2", fontSize: 12 }}
              />
              <Bar dataKey="count" fill={ACCENT} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* 차트 3: 참여업체 수별 평균 투찰률 */}
      {data.byNumBidders.length > 0 && (
        <ChartCard title="참여업체 수별 평균 투찰률">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.byNumBidders} margin={{ top: 5, right: 20, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis
                dataKey="numBidders"
                tick={{ fontSize: 11, fill: "#6B7280" }}
                label={{ value: "참여업체 수 (개사)", position: "insideBottom", offset: -10, fontSize: 11, fill: "#6B7280" }}
              />
              <YAxis
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 11, fill: "#6B7280" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v) => [`${Number(v).toFixed(2)}%`, "평균 투찰률"]}
                contentStyle={{ borderRadius: 8, border: "1px solid #E8ECF2", fontSize: 12 }}
              />
              <Line
                type="monotone"
                dataKey="avgRate"
                stroke={NAVY}
                strokeWidth={2.5}
                dot={{ r: 4, fill: NAVY, strokeWidth: 0 }}
                activeDot={{ r: 6, fill: ACCENT }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* 면책 고지 */}
      <div style={{
        background: "#F8FAFC",
        border: "1px solid #E8ECF2",
        borderRadius: 10,
        padding: "14px 18px",
        fontSize: 12,
        color: "#6B7280",
        lineHeight: 1.6,
      }}>
        ※ 본 통계는 나라장터 공개 낙찰 결과 데이터를 기반으로 산출되었습니다.
        과거 통계가 미래 낙찰을 보장하지 않으며, 참고 자료로만 활용하시기 바랍니다.
      </div>
    </div>
  );
}
