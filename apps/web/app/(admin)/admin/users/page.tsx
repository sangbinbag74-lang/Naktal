"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { AdminTable } from "@/components/admin/AdminTable";
import { CsvDownload } from "@/components/admin/CsvDownload";
import { isProxySignup } from "@/lib/biz-name-match";

interface UserRow {
  id: string;
  bizNo: string;
  bizName: string;
  ownerName: string;
  plan: string;
  isActive: boolean;
  createdAt: string;
  address: string | null;
  marketingConsent: boolean;
  marketingConsentAt: string | null;
  notifyEmail: string | null;
  notifyPhone: string | null;
  kakaoId: string | null;
  kakaoVerifiedName: string | null;
  kakaoVerifiedAt: string | null;
}

const PLAN_LABELS: Record<string, string> = { FREE: "무료", STANDARD: "라이트(구)", LITE: "라이트", PRO: "프로", BIZ: "비즈", MASTER: "마스터" };
const PLAN_STYLE: Record<string, { background: string; color: string }> = {
  MASTER:   { background: "#0F172A", color: "#F8FAFC" },
  BIZ:      { background: "#EDE9FE", color: "#6D28D9" },
  PRO:      { background: "#DBEAFE", color: "#1B3A6B" },
  LITE:     { background: "#E0F2FE", color: "#1D4ED8" },
  STANDARD: { background: "#E0F2FE", color: "#1D4ED8" },
  FREE:     { background: "#F1F5F9", color: "#64748B" },
};

function PlanSelect({ row, onChange }: { row: UserRow; onChange: (id: string, plan: string) => void }) {
  const [saving, setSaving] = useState(false);
  const s: { background: string; color: string } = PLAN_STYLE[row.plan] ?? { background: "#F1F5F9", color: "#64748B" };

  async function handleChange(newPlan: string) {
    if (newPlan === row.plan) return;
    setSaving(true);
    await fetch(`/api/admin/users/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: newPlan, reason: "어드민 목록 직접 변경" }),
    });
    onChange(row.id, newPlan);
    setSaving(false);
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <select
        value={row.plan}
        disabled={saving}
        onChange={(e) => handleChange(e.target.value)}
        style={{
          appearance: "none",
          fontSize: 11, fontWeight: 600,
          padding: "2px 20px 2px 8px",
          borderRadius: 4, border: "none",
          cursor: saving ? "not-allowed" : "pointer",
          opacity: saving ? 0.6 : 1,
          ...s,
        }}
      >
        <option value="FREE">무료</option>
        <option value="LITE">라이트</option>
        <option value="PRO">프로</option>
        <option value="BIZ">비즈</option>
        <option value="MASTER">마스터</option>
      </select>
      <span style={{
        position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)",
        fontSize: 9, color: s.color, pointerEvents: "none",
      }}>▼</span>
    </div>
  );
}

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

  function handlePlanChange(userId: string, newPlan: string) {
    setData((prev) => prev.map((r) => r.id === userId ? { ...r, plan: newPlan } : r));
  }

  const inputStyle: React.CSSProperties = {
    height: 36, padding: "0 12px", fontSize: 13, border: "1px solid #E2E8F0",
    borderRadius: 8, background: "#fff", color: "#0F172A", outline: "none",
  };

  const columns = [
    { key: "bizNo", label: "사업자번호" },
    { key: "bizName", label: "상호명" },
    { key: "ownerName", label: "대표자" },
    {
      key: "address", label: "주소",
      render: (r: UserRow) => r.address
        ? <span style={{ fontSize: 12, color: "#0F172A", maxWidth: 240, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.address}>{r.address}</span>
        : <span style={{ fontSize: 12, color: "#CBD5E1" }}>미입력</span>,
    },
    {
      key: "marketingConsent", label: "수신동의",
      render: (r: UserRow) => r.marketingConsent
        ? <span title={r.marketingConsentAt ? `동의일: ${r.marketingConsentAt.slice(0, 10)}` : undefined}
                style={{ fontSize: 11, fontWeight: 700, color: "#059669", background: "#ECFDF5", padding: "2px 8px", borderRadius: 5 }}>동의</span>
        : <span style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", background: "#F1F5F9", padding: "2px 8px", borderRadius: 5 }}>미동의</span>,
    },
    {
      key: "kakaoId", label: "카카오",
      render: (r: UserRow) => r.kakaoId
        ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            <span title={r.kakaoVerifiedAt ? `인증일: ${r.kakaoVerifiedAt.slice(0, 10)}` : undefined}
                  style={{ fontSize: 11, fontWeight: 700, color: "#191600", background: "#FEE500", padding: "2px 8px", borderRadius: 5 }}>
              💬 {r.kakaoVerifiedName ?? "인증"}
            </span>
            {isProxySignup(r.ownerName, r.kakaoVerifiedName) && (
              <span title={`카카오 명의(${r.kakaoVerifiedName})가 대표자명(${r.ownerName})과 다름 — 실무자/대리 가입`}
                    style={{ fontSize: 10, fontWeight: 700, color: "#B45309", background: "#FEF3C7", padding: "2px 6px", borderRadius: 5 }}>
                실무자
              </span>
            )}
          </span>
        : <span style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", background: "#F1F5F9", padding: "2px 8px", borderRadius: 5 }}>미인증</span>,
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
        <span style={{ display: "inline-flex", gap: 10 }}>
          <Link href={`/admin/users/${r.id}`} style={{ color: "#1B3A6B", fontSize: 12, textDecoration: "underline" }}>
            상세
          </Link>
          <Link href={`/admin/users/${r.id}/contracts`} style={{ color: "#7C3AED", fontSize: 12, textDecoration: "underline" }}>
            의뢰화면
          </Link>
        </span>
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
        <span>{total === 0 ? "0명" : `${(page - 1) * 50 + 1}–${Math.min(page * 50, total)} / ${total}명`}</span>
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
