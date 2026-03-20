"use client";

import { useEffect, useState, use } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";

interface UserDetail {
  id: string;
  bizNo: string;
  bizName: string;
  ownerName: string;
  plan: string;
  isAdmin: boolean;
  isActive: boolean;
  adminMemo: string | null;
  createdAt: string;
  notifyEmail: string | null;
  notifyPhone: string | null;
}
interface AlertRow { id: string; keywords: string[]; active: boolean }
interface SubRow { plan: string; status: string; currentPeriodEnd: string }

const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET ?? "";
const PLANS = ["FREE", "STANDARD", "PRO"];

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [user, setUser] = useState<UserDetail | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [sub, setSub] = useState<SubRow | null>(null);
  const [loading, setLoading] = useState(true);

  // 편집 상태
  const [planEdit, setPlanEdit] = useState("");
  const [memoEdit, setMemoEdit] = useState("");
  const [extendDate, setExtendDate] = useState("");
  const [saving, setSaving] = useState(false);

  // 모달
  const [modal, setModal] = useState<"deactivate" | "activate" | null>(null);
  const [modalReason, setModalReason] = useState("");

  useEffect(() => {
    fetch(`/api/admin/users/${id}`, { headers: { "x-admin-secret": ADMIN_SECRET } })
      .then((r) => r.json())
      .then((d: { user: UserDetail; alerts: AlertRow[]; subscription: SubRow }) => {
        setUser(d.user);
        setPlanEdit(d.user?.plan ?? "FREE");
        setMemoEdit(d.user?.adminMemo ?? "");
        setAlerts(d.alerts ?? []);
        setSub(d.subscription);
        if (d.subscription?.currentPeriodEnd) {
          setExtendDate(d.subscription.currentPeriodEnd.slice(0, 10));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-secret": ADMIN_SECRET },
      body: JSON.stringify({ plan: planEdit, adminMemo: memoEdit, currentPeriodEnd: extendDate || undefined, reason: "어드민 수동 변경" }),
    });
    setSaving(false);
    setUser((prev) => prev ? { ...prev, plan: planEdit, adminMemo: memoEdit } : prev);
  }

  async function handleAction(action: "deactivate" | "activate") {
    await fetch(`/api/admin/users/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": ADMIN_SECRET },
      body: JSON.stringify({ action, reason: modalReason }),
    });
    setUser((prev) => prev ? { ...prev, isActive: action === "activate" } : prev);
    setModal(null);
    setModalReason("");
  }

  if (loading) return <div className="text-white/40 text-center py-20">로딩 중...</div>;
  if (!user) return <div className="text-red-400 text-center py-20">사용자를 찾을 수 없습니다.</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold text-white">
        사용자 상세 — <span className="text-white/60 text-base font-normal">{user.bizName}</span>
      </h1>

      {/* 기본 정보 */}
      <section className="bg-white/5 border border-white/10 rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white/60">기본 정보</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[["사업자번호", user.bizNo], ["상호명", user.bizName], ["대표자", user.ownerName],
            ["가입일", user.createdAt.slice(0, 10)], ["알림 이메일", user.notifyEmail ?? "-"], ["알림 전화", user.notifyPhone ?? "-"]].map(([label, val]) => (
            <div key={label}>
              <span className="text-white/40">{label}</span>
              <p className="text-white mt-0.5">{val}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 플랜 수동 변경 */}
      <section className="bg-white/5 border border-white/10 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white/60">플랜 / 구독 관리</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-white/50 mb-1">플랜</label>
            <select value={planEdit} onChange={(e) => setPlanEdit(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1">구독 만료일</label>
            <input type="date" value={extendDate} onChange={(e) => setExtendDate(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1">어드민 메모</label>
          <textarea value={memoEdit} onChange={(e) => setMemoEdit(e.target.value)} rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-40 transition-colors">
          {saving ? "저장 중..." : "저장"}
        </button>
      </section>

      {/* 알림 조건 */}
      <section className="bg-white/5 border border-white/10 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-white/60 mb-3">알림 조건 ({alerts.length}개)</h2>
        {alerts.length === 0 ? <p className="text-xs text-white/40">알림 조건 없음</p> :
          alerts.map((a) => (
            <div key={a.id} className="text-sm text-white/70 border-b border-white/5 py-2">
              키워드: {a.keywords.join(", ") || "없음"} / {a.active ? "활성" : "비활성"}
            </div>
          ))}
      </section>

      {/* 계정 활성화/비활성화 */}
      <section className="bg-white/5 border border-red-900/30 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-red-400 mb-3">위험 구역</h2>
        {user.isActive ? (
          <button onClick={() => setModal("deactivate")}
            className="px-4 py-2 text-sm font-medium bg-red-900 hover:bg-red-800 text-white rounded-md transition-colors">
            계정 비활성화
          </button>
        ) : (
          <button onClick={() => setModal("activate")}
            className="px-4 py-2 text-sm font-medium bg-green-800 hover:bg-green-700 text-white rounded-md transition-colors">
            계정 재활성화
          </button>
        )}
      </section>

      <ConfirmModal
        open={modal !== null}
        title={modal === "deactivate" ? "계정 비활성화" : "계정 재활성화"}
        description={modal === "deactivate" ? "이 계정을 비활성화하면 사용자가 로그인할 수 없습니다." : "이 계정을 다시 활성화합니다."}
        confirmLabel={modal === "deactivate" ? "비활성화" : "재활성화"}
        danger={modal === "deactivate"}
        reasonRequired
        reason={modalReason}
        onReasonChange={setModalReason}
        onConfirm={() => modal && handleAction(modal)}
        onCancel={() => { setModal(null); setModalReason(""); }}
      />
    </div>
  );
}
