import { createAdminClient } from "@/lib/supabase/server";
import { BetaActionButtons } from "./BetaActionButtons";

export default async function AdminBetaPage() {
  const admin = createAdminClient();

  const [
    { count: totalCount },
    { count: pendingCount },
    { count: approvedCount },
    { count: rejectedCount },
  ] = await Promise.all([
    admin.from("BetaApplication").select("id", { count: "exact", head: true }),
    admin.from("BetaApplication").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
    admin.from("BetaApplication").select("id", { count: "exact", head: true }).eq("status", "APPROVED"),
    admin.from("BetaApplication").select("id", { count: "exact", head: true }).eq("status", "REJECTED"),
  ]);

  const { data: list } = await admin
    .from("BetaApplication")
    .select("id,bizNo,bizName,email,category,status,createdAt")
    .order("createdAt", { ascending: false })
    .limit(100);

  const statusColors: Record<string, string> = {
    PENDING: "#D97706",
    APPROVED: "#059669",
    REJECTED: "#6B7280",
  };
  const statusLabels: Record<string, string> = {
    PENDING: "대기중",
    APPROVED: "승인",
    REJECTED: "거절",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>베타 신청 관리</h2>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>베타 신청 목록 조회 및 승인/거절 처리</p>
      </div>

      {/* 통계 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "전체 신청", value: (totalCount ?? 0) + "건", color: "#1B3A6B" },
          { label: "대기중", value: (pendingCount ?? 0) + "건", color: "#D97706" },
          { label: "승인", value: (approvedCount ?? 0) + "건", color: "#059669" },
          { label: "거절", value: (rejectedCount ?? 0) + "건", color: "#6B7280" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "20px" }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* 신청 목록 */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 14 }}>
          베타 신청 목록 (최근 100건)
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                {["사업자번호", "상호명", "이메일", "업종", "신청일", "상태", "처리"].map((h) => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "#374151", fontWeight: 600, borderBottom: "2px solid #E8ECF2", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(list ?? []).map((r: any) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={{ padding: "8px 12px", color: "#374151", fontFamily: "monospace" }}>{r.bizNo}</td>
                  <td style={{ padding: "8px 12px", color: "#0F172A", fontWeight: 500 }}>{r.bizName}</td>
                  <td style={{ padding: "8px 12px", color: "#64748B" }}>{r.email}</td>
                  <td style={{ padding: "8px 12px", color: "#64748B" }}>{r.category}</td>
                  <td style={{ padding: "8px 12px", color: "#6B7280", whiteSpace: "nowrap" }}>
                    {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{
                      fontSize: 12, padding: "3px 8px", borderRadius: 5,
                      background: (statusColors[r.status] ?? "#374151") + "1a",
                      color: statusColors[r.status] ?? "#374151",
                      fontWeight: 700,
                    }}>
                      {statusLabels[r.status] ?? r.status}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    {r.status === "PENDING" && <BetaActionButtons id={r.id} />}
                  </td>
                </tr>
              ))}
              {(list ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: "20px", color: "#9CA3AF", textAlign: "center" }}>신청 내역 없음</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
