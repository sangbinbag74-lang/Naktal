"use client";

import { useEffect, useState, useCallback } from "react";
import { AdminTable } from "@/components/admin/AdminTable";
import { ConfirmModal } from "@/components/admin/ConfirmModal";

interface AnnRow {
  id: string;
  konepsId: string;
  title: string;
  orgName: string;
  budget: number;
  deadline: string;
  category: string;
  isPinned: boolean;
  deletedAt: string | null;
  createdAt: string;
}

const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET ?? "";

export default function AdminAnnouncementsPage() {
  const [data, setData] = useState<AnnRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ row: AnnRow; action: "delete" | "restore" } | null>(null);
  const [reason, setReason] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), q, deleted: String(showDeleted) });
    const res = await fetch(`/api/admin/announcements?${params}`, { headers: { "x-admin-secret": ADMIN_SECRET } });
    const json = (await res.json()) as { data: AnnRow[]; total: number };
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [page, q, showDeleted]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  async function handleAction() {
    if (!actionTarget) return;
    await fetch("/api/admin/announcements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-secret": ADMIN_SECRET },
      body: JSON.stringify({ id: actionTarget.row.id, action: actionTarget.action, reason }),
    });
    setActionTarget(null);
    setReason("");
    void fetchData();
  }

  async function handlePin(row: AnnRow) {
    await fetch("/api/admin/announcements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-secret": ADMIN_SECRET },
      body: JSON.stringify({ id: row.id, action: row.isPinned ? "unpin" : "pin" }),
    });
    void fetchData();
  }

  const columns = [
    { key: "konepsId", label: "공고번호", render: (r: AnnRow) => <span className="text-xs font-mono">{r.konepsId}</span> },
    { key: "title", label: "공고명", render: (r: AnnRow) => <span className="text-xs max-w-[200px] truncate block">{r.title}</span> },
    { key: "orgName", label: "발주기관", render: (r: AnnRow) => <span className="text-xs">{r.orgName}</span> },
    { key: "category", label: "업종", render: (r: AnnRow) => <span className="text-xs">{r.category}</span> },
    { key: "deadline", label: "마감일", render: (r: AnnRow) => r.deadline.slice(0, 10) },
    {
      key: "isPinned", label: "핀",
      render: (r: AnnRow) => (
        <button onClick={() => handlePin(r)} className={`text-xs ${r.isPinned ? "text-yellow-400" : "text-white/30"} hover:text-yellow-400`}>
          {r.isPinned ? "★ 핀" : "☆"}
        </button>
      ),
    },
    {
      key: "status", label: "상태",
      render: (r: AnnRow) => r.deletedAt
        ? <span className="text-red-400 text-xs">삭제됨</span>
        : <span className="text-green-400 text-xs">활성</span>,
    },
    {
      key: "actions", label: "관리",
      render: (r: AnnRow) => r.deletedAt
        ? <button onClick={() => setActionTarget({ row: r, action: "restore" })} className="text-blue-400 hover:text-blue-300 text-xs underline">복구</button>
        : <button onClick={() => setActionTarget({ row: r, action: "delete" })} className="text-red-400 hover:text-red-300 text-xs underline">삭제</button>,
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-white">공고 관리 <span className="text-white/40 text-sm font-normal">({total.toLocaleString()}건)</span></h1>

      <div className="flex gap-3 items-center">
        <input type="text" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder="공고명 / 발주기관 / 공고번호 검색"
          className="bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64" />
        <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
          <input type="checkbox" checked={showDeleted} onChange={(e) => { setShowDeleted(e.target.checked); setPage(1); }}
            className="rounded" />
          삭제된 공고 포함
        </label>
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
        open={actionTarget !== null}
        title={actionTarget?.action === "delete" ? "공고 삭제" : "공고 복구"}
        description={actionTarget?.action === "delete"
          ? `"${actionTarget?.row.title}" 공고를 삭제합니다.`
          : `"${actionTarget?.row.title}" 공고를 복구합니다.`}
        confirmLabel={actionTarget?.action === "delete" ? "삭제" : "복구"}
        danger={actionTarget?.action === "delete"}
        reasonRequired
        reason={reason}
        onReasonChange={setReason}
        onConfirm={handleAction}
        onCancel={() => { setActionTarget(null); setReason(""); }}
      />
    </div>
  );
}
