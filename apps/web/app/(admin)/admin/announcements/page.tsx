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

const inputStyle: React.CSSProperties = {
  height: 36, padding: "0 12px", fontSize: 13, border: "1px solid #E2E8F0",
  borderRadius: 8, background: "#fff", color: "#0F172A", outline: "none",
};

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
    const res = await fetch(`/api/admin/announcements?${params}`);
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: actionTarget.row.id, action: actionTarget.action, reason }),
    });
    setActionTarget(null);
    setReason("");
    void fetchData();
  }

  async function handlePin(row: AnnRow) {
    await fetch("/api/admin/announcements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, action: row.isPinned ? "unpin" : "pin" }),
    });
    void fetchData();
  }

  const columns = [
    { key: "konepsId", label: "공고번호", render: (r: AnnRow) => <span style={{ fontFamily: "monospace", fontSize: 12 }}>{r.konepsId}</span> },
    { key: "title", label: "공고명", render: (r: AnnRow) => <span style={{ fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{r.title}</span> },
    { key: "orgName", label: "발주기관", render: (r: AnnRow) => <span style={{ fontSize: 12 }}>{r.orgName}</span> },
    { key: "category", label: "업종", render: (r: AnnRow) => <span style={{ fontSize: 12 }}>{r.category}</span> },
    { key: "deadline", label: "마감일", render: (r: AnnRow) => r.deadline.slice(0, 10) },
    {
      key: "isPinned", label: "핀",
      render: (r: AnnRow) => (
        <button onClick={() => handlePin(r)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: r.isPinned ? "#F59E0B" : "#CBD5E1" }}>
          {r.isPinned ? "★" : "☆"}
        </button>
      ),
    },
    {
      key: "status", label: "상태",
      render: (r: AnnRow) => r.deletedAt
        ? <span style={{ color: "#DC2626", fontSize: 11, fontWeight: 600 }}>삭제됨</span>
        : <span style={{ color: "#16A34A", fontSize: 11, fontWeight: 600 }}>활성</span>,
    },
    {
      key: "actions", label: "관리",
      render: (r: AnnRow) => r.deletedAt
        ? <button onClick={() => setActionTarget({ row: r, action: "restore" })} style={{ color: "#1B3A6B", fontSize: 12, textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}>복구</button>
        : <button onClick={() => setActionTarget({ row: r, action: "delete" })} style={{ color: "#DC2626", fontSize: 12, textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}>삭제</button>,
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>
        공고 관리 <span style={{ fontSize: 13, color: "#94A3B8", fontWeight: 400 }}>({total.toLocaleString()}건)</span>
      </h1>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input type="text" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder="공고명 / 발주기관 / 공고번호 검색"
          style={{ ...inputStyle, width: 260 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#475569", cursor: "pointer" }}>
          <input type="checkbox" checked={showDeleted} onChange={(e) => { setShowDeleted(e.target.checked); setPage(1); }} />
          삭제된 공고 포함
        </label>
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
