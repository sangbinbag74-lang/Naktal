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

const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET ?? "";
const PLAN_LABELS: Record<string, string> = { FREE: "무료", STANDARD: "스탠다드", PRO: "프로" };

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
    const res = await fetch(`/api/admin/users?${params}`, {
      headers: { "x-admin-secret": ADMIN_SECRET },
    });
    const json = (await res.json()) as { data: UserRow[]; total: number };
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [page, q, planFilter]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const columns = [
    { key: "bizNo", label: "사업자번호" },
    { key: "bizName", label: "상호명" },
    { key: "ownerName", label: "대표자" },
    {
      key: "plan", label: "플랜",
      render: (r: UserRow) => (
        <span className={`text-xs px-2 py-0.5 rounded-full ${r.plan === "PRO" ? "bg-purple-900 text-purple-300" : r.plan === "STANDARD" ? "bg-blue-900 text-blue-300" : "bg-white/10 text-white/60"}`}>
          {PLAN_LABELS[r.plan] ?? r.plan}
        </span>
      ),
    },
    { key: "isActive", label: "상태", render: (r: UserRow) => r.isActive ? <span className="text-green-400">활성</span> : <span className="text-red-400">비활성</span> },
    { key: "createdAt", label: "가입일", render: (r: UserRow) => r.createdAt.slice(0, 10) },
    {
      key: "actions", label: "관리",
      render: (r: UserRow) => (
        <Link href={`/admin/users/${r.id}`} className="text-blue-400 hover:text-blue-300 text-xs underline">
          상세
        </Link>
      ),
    },
  ] as Parameters<typeof AdminTable>[0]["columns"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">사용자 관리 <span className="text-white/40 text-sm font-normal">({total.toLocaleString()}명)</span></h1>
        <CsvDownload
          data={data as unknown as Record<string, unknown>[]}
          filename={`users-${new Date().toISOString().slice(0, 10)}.csv`}
        />
      </div>

      {/* 필터 */}
      <div className="flex gap-3">
        <input
          type="text"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder="사업자번호 / 상호명 검색"
          className="bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
        />
        <select
          value={planFilter}
          onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
          className="bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">전체 플랜</option>
          <option value="FREE">무료</option>
          <option value="STANDARD">스탠다드</option>
          <option value="PRO">프로</option>
        </select>
      </div>

      {loading ? (
        <div className="text-white/40 py-10 text-center">로딩 중...</div>
      ) : (
        <AdminTable
          columns={columns}
          data={data as unknown as Record<string, unknown>[]}
          keyField="id"
        />
      )}

      {/* 페이지네이션 */}
      <div className="flex items-center justify-between text-sm text-white/50">
        <span>{(page - 1) * 50 + 1}–{Math.min(page * 50, total)} / {total}명</span>
        <div className="flex gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 bg-white/10 rounded disabled:opacity-30 hover:bg-white/20">이전</button>
          <button onClick={() => setPage((p) => p + 1)} disabled={page * 50 >= total} className="px-3 py-1.5 bg-white/10 rounded disabled:opacity-30 hover:bg-white/20">다음</button>
        </div>
      </div>
    </div>
  );
}
