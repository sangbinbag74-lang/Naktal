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
        <span style={{
          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
          background: r.status === "SUCCESS" ? "#DCFCE7" : r.status === "FAILED" ? "#FEE2E2" : "#FEF9C3",
          color: r.status === "SUCCESS" ? "#166534" : r.status === "FAILED" ? "#991B1B" : "#854D0E",
        }}>
          {r.status}
        </span>
      ),
    },
    { key: "count", label: "수집 건수" },
    {
      key: "errors", label: "오류",
      render: (r: StatsData["recentCrawlLogs"][0]) =>
        r.errors ? <span style={{ color: "#DC2626", fontSize: 12 }}>{r.errors.slice(0, 40)}</span> : "-",
    },
  ] as Parameters<typeof AdminTable>[0]["columns"];

  if (loading) {
    return <div style={{ color: "#94A3B8", padding: "80px 0", textAlign: "center" }}>로딩 중...</div>;
  }

  if (!stats) {
    return <div style={{ color: "#DC2626", padding: "80px 0", textAlign: "center" }}>데이터를 불러올 수 없습니다.</div>;
  }

  const maxCount = Math.max(...stats.signupTrend.map((d) => d.count), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>운영 대시보드</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        <AdminStatCard title="전체 가입자" value={stats.totalUsers.toLocaleString()} icon="👥" />
        <AdminStatCard title="유료 구독자" value={stats.paidUsers.toLocaleString()} icon="💳" />
        <AdminStatCard title="이번 달 신규" value={stats.newUsersMonth.toLocaleString()} icon="🆕" />
        <AdminStatCard title="이번 달 매출" value={`${stats.monthRevenue.toLocaleString()}원`} icon="💰" />
        <AdminStatCard title="총 공고 수집" value={stats.totalAnnouncements.toLocaleString()} icon="📋" />
        <AdminStatCard title="오늘 크롤링" value={`${stats.todayCrawlCount}회`} icon="🕷️" />
      </div>

      {/* 최근 7일 신규 가입자 차트 */}
      <div style={{ background: "#fff", border: "1px solid #E8ECF2", borderRadius: 12, padding: "16px 18px" }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 14 }}>최근 7일 신규 가입자</h2>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100 }}>
          {stats.signupTrend.map((d) => {
            const pct = (d.count / maxCount) * 100;
            return (
              <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, height: "100%", justifyContent: "flex-end" }}>
                <span style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>{d.count}</span>
                <div style={{ width: "100%", minHeight: 4, height: `${Math.max(pct, 4)}%`, background: "#1B3A6B", borderRadius: "3px 3px 0 0" }} />
                <span style={{ fontSize: 10, color: "#94A3B8", whiteSpace: "nowrap" }}>{d.date.slice(5)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 10 }}>최근 크롤링 로그</h2>
        <AdminTable
          columns={crawlColumns}
          data={stats.recentCrawlLogs as unknown as Record<string, unknown>[]}
          keyField="id"
        />
      </div>
    </div>
  );
}
