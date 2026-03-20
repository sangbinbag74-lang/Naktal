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

const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET ?? "";
const STATUS_LABELS: Record<string, string> = { ACTIVE: "활성", CANCELLED: "취소", EXPIRED: "만료" };
const PLAN_PRICES: Record<string, number> = { STANDARD: 99000, PRO: 199000 };

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
    const res = await fetch(`/api/admin/payments?${params}`, { headers: { "x-admin-secret": ADMIN_SECRET } });
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
      headers: { "Content-Type": "application/json", "x-admin-secret": ADMIN_SECRET },
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
        <span className={r.status === "ACTIVE" ? "text-green-400" : "text-red-400"}>
          {STATUS_LABELS[r.status] ?? r.status}
        </span>
      ),
    },
    {
      key: "actions", label: "관리",
      render: (r: SubRow) => r.status === "ACTIVE" ? (
        <button onClick={() => setCancelTarget(r)} className="text-red-400 hover:text-red-300 text-xs underline">
          취소
        </button>
      ) : <span className="text-white/30 text-xs">-</span>,
    },
  ] as Parameters<typeof AdminTable>[0]["columns"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">결제 내역</h1>
          <p className="text-sm text-white/40 mt-0.5">
            이번 달 매출: <span className="text-green-400 font-semibold">{monthRevenue.toLocaleString()}원</span>
          </p>
        </div>
        <CsvDownload data={data as unknown as Record<string, unknown>[]} filename={`payments-${new Date().toISOString().slice(0, 10)}.csv`} />
      </div>

      <div className="flex gap-3">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">전체 상태</option>
          <option value="ACTIVE">활성</option>
          <option value="CANCELLED">취소</option>
          <option value="EXPIRED">만료</option>
        </select>
        <select value={planFilter} onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
          className="bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">전체 플랜</option>
          <option value="STANDARD">스탠다드</option>
          <option value="PRO">프로</option>
        </select>
      </div>

      {loading ? <div className="text-white/40 text-center py-10">로딩 중...</div> : (
        <AdminTable columns={columns} data={data as unknown as Record<string, unknown>[]} keyField="id" />
      )}

      <div className="flex items-center justify-between text-sm text-white/50">
        <span>총 {total}건</span>
        <div className="flex gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 bg-white/10 rounded disabled:opacity-30 hover:bg-white/20">이전</button>
          <button onClick={() => setPage((p) => p + 1)} disabled={page * 50 >= total} className="px-3 py-1.5 bg-white/10 rounded disabled:opacity-30 hover:bg-white/20">다음</button>
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
