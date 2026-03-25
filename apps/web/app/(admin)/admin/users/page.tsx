"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { AdminTable } from "@/components/admin/AdminTable";
import { CsvDownload } from "@/components/admin/CsvDownload";

interface UserRow {
  id: string;
  bizNo: string;
  bizName: string;
  ownerName: string;
  plan: string;
  isActive: boolean;
  createdAt: string;
}

const PLAN_LABELS: Record<string, string> = { FREE: "무료", STANDARD: "스탠다드", PRO: "프로" };
const PLAN_STYLE: Record<string, { background: string; color: string }> = {
  PRO:      { background: "#EDE9FE", color: "#6D28D9" },
  STANDARD: { background: "#DBEAFE", color: "#1D4ED8" },
  FREE:     { background: "#F1F5F9", color: "#64748B" },
};

export default function AdminUsersPage() {
  const [data, setData] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), q, plan: planFilter });
    const res = await fetch(`/api/admin/users?${params}`);
    const json = (await res.json()) as { data: UserRow[]; total: number };
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [page, q, planFilter]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const inputStyle: React.CSSProperties = {
    height: 36, padding: "0 12px", fontSize: 13, border: "1px solid #E2E8F0",
    borderRadius: 8, background: "#fff", color: "#0F172A", outline: "none",
  };

  const columns = [
    { key: "bizNo", label: "사업자번호" },
    { key: "bizName", label: "상호명" },
    { key: "ownerName", label: "대표자" },
    {
      key: "plan", label: "플랜",
      render: (r: UserRow) => {
        const s = PLAN_STYLE[r.plan] ?? PLAN_STYLE.FREE;
        return (
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, ...s }}>
            {PLAN_LABELS[r.plan] ?? r.plan}
          </span>
        );
      },
    },
    {
      key: "isActive", label: "상태",
      render: (r: UserRow) => r.isActive
        ? <span style={{ color: "#16A34A", fontSize: 12, fontWeight: 600 }}>활성</span>
        : <span style={{ color: "#DC2626", fontSize: 12, fontWeight: 600 }}>비활성</span>,
    },
    { key: "createdAt", label: "가입일", render: (r: UserRow) => r.createdAt.slice(0, 10) },
    {
      key: "actions", label: "관리",
      render: (r: UserRow) => (
        <Link href={`/admin/users/${r.id}`} style={{ color: "#1B3A6B", fontSize: 12, textDecoration: "underline" }}>
          상세
        </Link>
      ),
    },
  ] as Parameters<typeof AdminTable>[0]["columns"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>
          사용자 관리 <span style={{ fontSize: 13, color: "#94A3B8", fontWeight: 400 }}>({total.toLocaleString()}명)</span>
        </h1>
        <CsvDownload
          data={data as unknown as Record<string, unknown>[]}
          filename={`users-${new Date().toISOString().slice(0, 10)}.csv`}
        />
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <input
          type="text"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder="사업자번호 / 상호명 검색"
          style={{ ...inputStyle, width: 220 }}
        />
        <select
          value={planFilter}
          onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
          style={inputStyle}
        >
          <option value="">전체 플랜</option>
          <option value="FREE">무료</option>
          <option value="STANDARD">스탠다드</option>
          <option value="PRO">프로</option>
        </select>
      </div>

      {loading ? (
        <div style={{ color: "#94A3B8", padding: "40px 0", textAlign: "center" }}>로딩 중...</div>
      ) : (
        <AdminTable
          columns={columns}
          data={data as unknown as Record<string, unknown>[]}
          keyField="id"
        />
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, color: "#64748B" }}>
        <span>{(page - 1) * 50 + 1}–{Math.min(page * 50, total)} / {total}명</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: "6px 14px", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 13, cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.4 : 1 }}>
            이전
          </button>
          <button onClick={() => setPage((p) => p + 1)} disabled={page * 50 >= total}
            style={{ padding: "6px 14px", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 13, cursor: page * 50 >= total ? "not-allowed" : "pointer", opacity: page * 50 >= total ? 0.4 : 1 }}>
            다음
          </button>
        </div>
      </div>
    </div>
  );
}
