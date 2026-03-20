"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DashboardStats {
  todayAnnouncements: number;
  monthAlerts: number;
  avgBidRate: string;
  weekBidResults: number;
}

const STAT_CONFIG = [
  {
    key: "todayAnnouncements" as const,
    title: "오늘 신규 공고",
    icon: "📋",
    description: "오늘 등록된 공고 수",
  },
  {
    key: "monthAlerts" as const,
    title: "이번 달 크롤링",
    icon: "🏢",
    description: "이번 달 수집된 데이터",
  },
  {
    key: "avgBidRate" as const,
    title: "평균 투찰률",
    icon: "📈",
    description: "전체 낙찰 평균",
  },
  {
    key: "weekBidResults" as const,
    title: "이번 주 낙찰 결과",
    icon: "🏆",
    description: "최근 7일 낙찰 건수",
  },
];

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">대시보드</h2>
        <p className="text-gray-500 text-sm mt-1">나라장터 입찰 현황을 한눈에 확인하세요.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CONFIG.map((card) => {
          const value = loading ? "..." : stats ? String(stats[card.key]) : "-";
          return (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  {card.title}
                </CardTitle>
                <span className="text-xl">{card.icon}</span>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">{value}</div>
                <p className="text-xs text-gray-500 mt-1">{card.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
