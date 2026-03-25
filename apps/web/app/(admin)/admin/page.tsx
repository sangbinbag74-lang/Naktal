"use client";

import { useEffect, useState } from "react";
import { AdminStatCard } from "@/components/admin/AdminStatCard";
import { AdminTable } from "@/components/admin/AdminTable";

interface StatsData {
  totalUsers: number;
  paidUsers: number;
  newUsersMonth: number;
  monthRevenue: number;
  totalAnnouncements: number;
  todayCrawlCount: number;
  signupTrend: { date: string; count: number }[];
  recentCrawlLogs: {
    id: string;
    runAt: string;
    type: string;
    status: string;
    count: number;
    errors: string | null;
  }[];
}

export default function AdminPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 쿠키 기반 인증 — x-admin-secret 헤더 불필요
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d.totalUsers === "number") {
          setStats(d as StatsData);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const crawlColumns = [
    { key: "runAt", label: "실행 시각", render: (r: StatsData["recentCrawlLogs"][0]) => new Date(r.runAt).toLocaleString("ko-KR") },
    { key: "type", label: "유형" },
    {
      key: "status", label: "상태",
      render: (r: StatsData["recentCrawlLogs"][0]) => (
        <span className={r.status === "SUCCESS" ? "text-green-400" : r.status === "FAILED" ? "text-red-400" : "text-yellow-400"}>
          {r.status}
        </span>
      ),
    },
    { key: "count", label: "수집 건수" },
    {
      key: "errors", label: "오류",
      render: (r: StatsData["recentCrawlLogs"][0]) =>
        r.errors ? <span className="text-red-400 text-xs">{r.errors.slice(0, 40)}</span> : "-",
    },
  ] as Parameters<typeof AdminTable>[0]["columns"];

  if (loading) {
    return <div className="text-white/40 py-20 text-center">로딩 중...</div>;
  }

  if (!stats) {
    return <div className="text-red-400 py-20 text-center">데이터를 불러올 수 없습니다.</div>;
  }

  const maxCount = Math.max(...stats.signupTrend.map((d) => d.count), 1);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-white">운영 대시보드</h1>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <AdminStatCard title="전체 가입자" value={stats.totalUsers.toLocaleString()} icon="👥" />
        <AdminStatCard title="유료 구독자" value={stats.paidUsers.toLocaleString()} icon="💳" />
        <AdminStatCard title="이번 달 신규 가입" value={stats.newUsersMonth.toLocaleString()} icon="🆕" />
        <AdminStatCard title="이번 달 결제 금액" value={`${stats.monthRevenue.toLocaleString()}원`} icon="💰" />
        <AdminStatCard title="총 공고 수집" value={stats.totalAnnouncements.toLocaleString()} icon="📋" />
        <AdminStatCard title="오늘 크롤링 실행" value={`${stats.todayCrawlCount}회`} icon="🕷️" />
      </div>

      {/* 최근 7일 신규 가입자 — CSS 막대차트 (recharts 대체) */}
      <div className="bg-white/5 border border-white/10 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-white/70 mb-4">최근 7일 신규 가입자</h2>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120 }}>
          {stats.signupTrend.map((d) => {
            const pct = (d.count / maxCount) * 100;
            return (
              <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{d.count}</span>
                <div style={{ width: "100%", minHeight: 4, height: `${Math.max(pct, 3)}%`, background: "#3B82F6", borderRadius: "3px 3px 0 0" }} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", whiteSpace: "nowrap" }}>{d.date.slice(5)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-white/70 mb-3">최근 크롤링 로그</h2>
        <AdminTable
          columns={crawlColumns}
          data={stats.recentCrawlLogs as unknown as Record<string, unknown>[]}
          keyField="id"
        />
      </div>
    </div>
  );
}
