"use client";

import { useEffect, useState, useCallback } from "react";
import { AdminTable } from "@/components/admin/AdminTable";
import { CsvDownload } from "@/components/admin/CsvDownload";
import { ConfirmModal } from "@/components/admin/ConfirmModal";

interface SubRow {
  id: string;
  userId: string;
  plan: string;
  portonePaymentId: string | null;
  status: string;
  createdAt: string;
  currentPeriodEnd: string;
}

const STATUS_LABELS: Record<string, string> = { ACTIVE: "활성", CANCELLED: "취소", EXPIRED: "만료" };
const PLAN_PRICES: Record<string, number> = { STANDARD: 99000, PRO: 199000 };

const inputStyle: React.CSSProperties = {
  height: 36, padding: "0 12px", fontSize: 13, border: "1px solid #E2E8F0",
  borderRadius: 8, background: "#fff", color: "#0F172A", outline: "none",
};

export default function AdminPaymentsPage() {
  const [data, setData] = useState<SubRow[]>([]);
  const [total, setTotal] = useState(0);
  const [monthRevenue, setMonthRevenue] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<SubRow | null>(null);
  const [reason, setReason] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), status: statusFilter, plan: planFilter });
    const res = await fetch(`/api/admin/payments?${params}`);
    const json = (await res.json()) as { data: SubRow[]; total: number; monthlyRevenue: number };
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setMonthRevenue(json.monthlyRevenue ?? 0);
    setLoading(false);
  }, [page, statusFilter, planFilter]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  async function handleCancel() {
    if (!cancelTarget) return;
    await fetch("/api/admin/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptionId: cancelTarget.id, reason }),
    });
    setCancelTarget(null);
    setReason("");
    void fetchData();
  }

  const columns = [
    { key: "plan", label: "플랜" },
    { key: "amount", label: "결제금액", render: (r: SubRow) => `${(PLAN_PRICES[r.plan] ?? 0).toLocaleString()}원` },
    { key: "portonePaymentId", label: "포트원 ID", render: (r: SubRow) => r.portonePaymentId ?? "-" },
    { key: "createdAt", label: "결제일", render: (r: SubRow) => r.createdAt.slice(0, 10) },
    { key: "currentPeriodEnd", label: "만료일", render: (r: SubRow) => r.currentPeriodEnd.slice(0, 10) },
    {
      key: "status", label: "상태",
      render: (r: SubRow) => (
        <span style={{
          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
          background: r.status === "ACTIVE" ? "#DCFCE7" : "#FEE2E2",
          color: r.status === "ACTIVE" ? "#166534" : "#991B1B",
        }}>
          {STATUS_LABELS[r.status] ?? r.status}
        </span>
      ),
    },
    {
      key: "actions", label: "관리",
      render: (r: SubRow) => r.status === "ACTIVE" ? (
        <button onClick={() => setCancelTarget(r)} style={{ color: "#DC2626", fontSize: 12, textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}>
          취소
        </button>
      ) : <span style={{ color: "#94A3B8", fontSize: 12 }}>-</span>,
    },
  ] as Parameters<typeof AdminTable>[0]["columns"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>결제 내역</h1>
          <p style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>
            이번 달 매출: <span style={{ color: "#16A34A", fontWeight: 600 }}>{monthRevenue.toLocaleString()}원</span>
          </p>
        </div>
        <CsvDownload data={data as unknown as Record<string, unknown>[]} filename={`payments-${new Date().toISOString().slice(0, 10)}.csv`} />
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} style={inputStyle}>
          <option value="">전체 상태</option>
          <option value="ACTIVE">활성</option>
          <option value="CANCELLED">취소</option>
          <option value="EXPIRED">만료</option>
        </select>
        <select value={planFilter} onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }} style={inputStyle}>
          <option value="">전체 플랜</option>
          <option value="STANDARD">스탠다드</option>
          <option value="PRO">프로</option>
        </select>
      </div>

      {loading ? <div style={{ color: "#94A3B8", padding: "40px 0", textAlign: "center" }}>로딩 중...</div> : (
        <AdminTable columns={columns} data={data as unknown as Record<string, unknown>[]} keyField="id" />
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, color: "#64748B" }}>
        <span>총 {total}건</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: "6px 14px", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 13, cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.4 : 1 }}>이전</button>
          <button onClick={() => setPage((p) => p + 1)} disabled={page * 50 >= total}
            style={{ padding: "6px 14px", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 13, cursor: page * 50 >= total ? "not-allowed" : "pointer", opacity: page * 50 >= total ? 0.4 : 1 }}>다음</button>
        </div>
      </div>

      <ConfirmModal
        open={cancelTarget !== null}
        title="구독 수동 취소"
        description={`${cancelTarget?.plan} 구독을 취소하고 사용자 플랜을 FREE로 변경합니다.`}
        confirmLabel="취소 확인"
        danger
        reasonRequired
        reason={reason}
        onReasonChange={setReason}
        onConfirm={handleCancel}
        onCancel={() => { setCancelTarget(null); setReason(""); }}
      />
    </div>
  );
}
