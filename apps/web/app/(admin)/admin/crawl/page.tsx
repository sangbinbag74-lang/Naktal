"use client";

import { useEffect, useState, useCallback } from "react";
import { AdminTable } from "@/components/admin/AdminTable";

interface CrawlLogRow {
  id: string;
  runAt: string;
  type: string;
  status: string;
  count: number;
  errors: string | null;
}

const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET ?? "";

// KST 기준 다음 자동 실행 시각 계산
function nextCrawlTime(): string {
  const now = new Date();
  const kstHours = [6, 12, 18];
  const kstOffset = 9 * 60;
  const kstNow = new Date(now.getTime() + kstOffset * 60 * 1000);
  const kstH = kstNow.getUTCHours();
  const nextHour = kstHours.find((h) => h > kstH) ?? kstHours[0] ?? 6;
  const nextDate = nextHour <= kstH ? new Date(kstNow.getTime() + 86400000) : kstNow;
  nextDate.setUTCHours(nextHour, 0, 0, 0);
  return new Date(nextDate.getTime() - kstOffset * 60 * 1000).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default function AdminCrawlPage() {
  const [logs, setLogs] = useState<CrawlLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [crawlType, setCrawlType] = useState("all");
  const [pages, setPages] = useState("5");
  const [lastResult, setLastResult] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const res = await fetch(
      `${supabaseUrl}/rest/v1/CrawlLog?order=runAt.desc&limit=50`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    const data = await res.json() as CrawlLogRow[];
    setLogs(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  async function handleRun() {
    setRunning(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/admin/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": ADMIN_SECRET },
        body: JSON.stringify({ type: crawlType, pages: parseInt(pages, 10) }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      setLastResult(data.ok ? "✅ 크롤링 시작됨" : `오류: ${data.message ?? "알 수 없음"}`);
      setTimeout(fetchLogs, 3000);
    } catch {
      setLastResult("❌ 네트워크 오류");
    } finally {
      setRunning(false);
    }
  }

  const columns = [
    { key: "runAt", label: "실행 시각", render: (r: CrawlLogRow) => new Date(r.runAt).toLocaleString("ko-KR") },
    { key: "type", label: "유형" },
    {
      key: "status", label: "상태",
      render: (r: CrawlLogRow) => (
        <span className={r.status === "SUCCESS" ? "text-green-400" : r.status === "FAILED" ? "text-red-400" : "text-yellow-400"}>
          {r.status}
        </span>
      ),
    },
    { key: "count", label: "수집 건수" },
    { key: "errors", label: "오류", render: (r: CrawlLogRow) => r.errors ? <span className="text-red-400 text-xs">{r.errors.slice(0, 60)}</span> : "-" },
  ] as Parameters<typeof AdminTable>[0]["columns"];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-white">크롤링 관리</h1>

      {/* 다음 자동 실행 */}
      <div className="bg-white/5 border border-white/10 rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-white/50">다음 자동 실행 예정</p>
          <p className="text-sm text-white font-medium mt-0.5">{nextCrawlTime()} (KST)</p>
        </div>
        <span className="text-xs text-white/30">매일 06:00 / 12:00 / 18:00</span>
      </div>

      {/* 수동 실행 */}
      <div className="bg-white/5 border border-white/10 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white/70">수동 크롤링 실행</h2>
        <div className="flex gap-3 items-end">
          <div>
            <label className="block text-xs text-white/50 mb-1">유형</label>
            <select value={crawlType} onChange={(e) => setCrawlType(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">전체</option>
              <option value="announcement">공고</option>
              <option value="bid-result">낙찰 결과</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1">페이지 수</label>
            <input type="number" value={pages} onChange={(e) => setPages(e.target.value)} min={1} max={20}
              className="w-20 bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button onClick={handleRun} disabled={running}
            className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-40 transition-colors flex items-center gap-2">
            {running && <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {running ? "실행 중..." : "크롤링 시작"}
          </button>
        </div>
        {lastResult && <p className="text-sm text-white/70">{lastResult}</p>}
      </div>

      {/* 로그 테이블 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white/70">최근 크롤링 로그 (50건)</h2>
          <button onClick={fetchLogs} disabled={loading} className="text-xs text-blue-400 hover:text-blue-300">
            {loading ? "로딩 중..." : "새로고침"}
          </button>
        </div>
        <AdminTable columns={columns} data={logs as unknown as Record<string, unknown>[]} keyField="id" />
      </div>
    </div>
  );
}
