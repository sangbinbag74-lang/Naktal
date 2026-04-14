import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminModelPage() {
  const admin = createAdminClient();

  // ─── 서비스 현황 ────────────────────────────────────────────────────────────
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    { count: totalUsers },
    { count: proUsers },
    { count: todayPreds },
    { count: pendingBids },
  ] = await Promise.all([
    admin.from("User").select("id", { count: "exact", head: true }).eq("isActive", true),
    admin.from("User").select("id", { count: "exact", head: true }).in("plan", ["PRO", "STANDARD"]),
    admin.from("AIPrediction").select("id", { count: "exact", head: true }).gte("predictedAt", todayStart.toISOString()),
    admin.from("BidOutcome").select("id", { count: "exact", head: true }).eq("result", "PENDING"),
  ]);

  // ─── 최근 크롤링 현황 ────────────────────────────────────────────────────────
  const { data: crawlLogs } = await admin
    .from("CrawlLog")
    .select("type,status,count,errors,createdAt")
    .order("createdAt", { ascending: false })
    .limit(5);

  const crawlStatusColors: Record<string, string> = {
    SUCCESS: "#059669", PARTIAL: "#D97706", FAILED: "#DC2626",
  };
  const crawlTypeLabels: Record<string, string> = {
    ANNOUNCEMENT: "공고", BID_RESULT: "낙찰결과", HIST_CURSOR: "커서",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>운영 현황</h2>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>서비스 지표 · 크롤링 상태</p>
      </div>

      {/* ── 서비스 현황 4카드 ── */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 10 }}>서비스 현황</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { label: "전체 회원", value: (totalUsers ?? 0) + "명", color: "#1B3A6B" },
            { label: "프로 회원", value: (proUsers ?? 0) + "명", color: "#059669" },
            { label: "오늘 AI 분석", value: (todayPreds ?? 0) + "건", color: "#1B3A6B" },
            { label: "미결 투찰", value: (pendingBids ?? 0) + "건", color: (pendingBids ?? 0) > 10 ? "#D97706" : "#374151" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "20px" }}>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 최근 크롤링 현황 ── */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 14 }}>최근 크롤링 현황</div>
        {(crawlLogs ?? []).length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                {["실행시간", "타입", "상태", "수집건수", "오류"].map((h) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#374151", fontWeight: 600, borderBottom: "2px solid #E8ECF2" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(crawlLogs as any[]).map((log, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={{ padding: "8px 12px", color: "#6B7280", whiteSpace: "nowrap" }}>
                    {new Date(log.createdAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td style={{ padding: "8px 12px", color: "#374151" }}>{crawlTypeLabels[log.type] ?? log.type}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: crawlStatusColors[log.status] ?? "#374151", background: (crawlStatusColors[log.status] ?? "#374151") + "1a", padding: "2px 7px", borderRadius: 5 }}>
                      {log.status}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px", color: "#374151", fontWeight: 600 }}>{(log.count ?? 0).toLocaleString()}건</td>
                  <td style={{ padding: "8px 12px", color: "#DC2626", fontSize: 12, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {log.errors ?? <span style={{ color: "#D1D5DB" }}>-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: "#9CA3AF", fontSize: 13 }}>크롤링 로그 없음</div>
        )}
      </div>
    </div>
  );
}
