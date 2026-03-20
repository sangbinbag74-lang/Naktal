"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ByCategoryItem { category: string; avgRate: number; count: number; }
interface DistributionItem { range: string; count: number; }
interface ByNumBiddersItem { numBidders: number; avgRate: number; }
interface StatsData {
  byCategory: ByCategoryItem[];
  distribution: DistributionItem[];
  byNumBidders: ByNumBiddersItem[];
}

const PRIMARY = "#1E3A5F";
const ACCENT = "#3B82F6";

export default function AnalysisPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analysis/bid-rate-stats")
      .then((r) => r.json())
      .then((d: StatsData) => setData(d))
      .catch(() => console.error("통계 로드 실패"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="py-20 text-center text-gray-400">통계 데이터를 불러오는 중...</div>;
  }

  if (!data) {
    return <div className="py-20 text-center text-gray-400">데이터를 불러올 수 없습니다.</div>;
  }

  const isEmpty = data.byCategory.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">투찰 분석</h2>
        <p className="text-sm text-gray-500 mt-1">낙찰 결과 데이터 기반 투찰률 통계</p>
      </div>

      {isEmpty && (
        <div className="py-20 text-center text-gray-400 bg-white rounded-lg border">
          아직 낙찰 결과 데이터가 없습니다. 크롤러를 실행해 데이터를 수집해주세요.
        </div>
      )}

      {/* 차트 1: 업종별 평균 낙찰 투찰률 */}
      {data.byCategory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">업종별 평균 낙찰 투찰률</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.byCategory} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                <YAxis
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) => `${v}%`}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip formatter={(v) => [`${Number(v)}%`, "평균 투찰률"]} />
                <Bar dataKey="avgRate" radius={[4, 4, 0, 0]}>
                  {data.byCategory.map((_, i) => (
                    <Cell key={i} fill={i % 2 === 0 ? PRIMARY : ACCENT} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* 차트 2: 투찰률 분포 히스토그램 */}
      {data.distribution.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">투찰률 분포 (구간별 낙찰 건수)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.distribution} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => [Number(v) + "건", "낙찰 건수"]} />
                <Bar dataKey="count" fill={ACCENT} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* 차트 3: 참여업체 수별 평균 투찰률 */}
      {data.byNumBidders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">참여업체 수별 평균 투찰률</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data.byNumBidders} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="numBidders" label={{ value: "참여업체 수", position: "insideBottom", offset: -2, fontSize: 12 }} />
                <YAxis
                  tickFormatter={(v: number) => `${v}%`}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip formatter={(v) => [`${Number(v)}%`, "평균 투찰률"]} />
                <Line type="monotone" dataKey="avgRate" stroke={PRIMARY} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
