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

const inputStyle: React.CSSProperties = {
  height: 36, padding: "0 12px", fontSize: 13, border: "1px solid #E2E8F0",
  borderRadius: 8, background: "#fff", color: "#0F172A", outline: "none",
};

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
        headers: { "Content-Type": "application/json" },
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
    { key: "errors", label: "오류", render: (r: CrawlLogRow) => r.errors ? <span style={{ color: "#DC2626", fontSize: 12 }}>{r.errors.slice(0, 60)}</span> : "-" },
  ] as Parameters<typeof AdminTable>[0]["columns"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>크롤링 관리</h1>

      {/* 다음 자동 실행 */}
      <div style={{ background: "#fff", border: "1px solid #E8ECF2", borderRadius: 12, padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: 12, color: "#64748B" }}>다음 자동 실행 예정</p>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", marginTop: 4 }}>{nextCrawlTime()} (KST)</p>
        </div>
        <span style={{ fontSize: 12, color: "#94A3B8" }}>매일 06:00 / 12:00 / 18:00</span>
      </div>

      {/* 수동 실행 */}
      <div style={{ background: "#fff", border: "1px solid #E8ECF2", borderRadius: 12, padding: "18px 20px" }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 14 }}>수동 크롤링 실행</h2>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#64748B", marginBottom: 5 }}>유형</label>
            <select value={crawlType} onChange={(e) => setCrawlType(e.target.value)} style={inputStyle}>
              <option value="all">전체</option>
              <option value="announcement">공고</option>
              <option value="bid-result">낙찰 결과</option>
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#64748B", marginBottom: 5 }}>페이지 수</label>
            <input type="number" value={pages} onChange={(e) => setPages(e.target.value)} min={1} max={20}
              style={{ ...inputStyle, width: 80 }} />
          </div>
          <button onClick={handleRun} disabled={running}
            style={{
              height: 36, padding: "0 20px", background: running ? "#94A3B8" : "#1B3A6B",
              color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: "none", cursor: running ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6,
            }}>
            {running && <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />}
            {running ? "실행 중..." : "크롤링 시작"}
          </button>
        </div>
        {lastResult && <p style={{ fontSize: 13, color: "#475569", marginTop: 12 }}>{lastResult}</p>}
      </div>

      {/* 로그 테이블 */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>최근 크롤링 로그 (50건)</h2>
          <button onClick={fetchLogs} disabled={loading}
            style={{ fontSize: 12, color: "#1B3A6B", background: "none", border: "none", cursor: "pointer" }}>
            {loading ? "로딩 중..." : "새로고침"}
          </button>
        </div>
        <AdminTable columns={columns} data={logs as unknown as Record<string, unknown>[]} keyField="id" />
      </div>
    </div>
  );
}
