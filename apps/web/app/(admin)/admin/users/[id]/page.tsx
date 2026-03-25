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

const PLANS = ["FREE", "STANDARD", "PRO"];

const inputStyle: React.CSSProperties = {
  height: 38, padding: "0 12px", fontSize: 13, border: "1px solid #E2E8F0",
  borderRadius: 8, background: "#fff", color: "#0F172A", outline: "none", width: "100%",
};

const sectionStyle: React.CSSProperties = {
  background: "#fff", border: "1px solid #E8ECF2", borderRadius: 12, padding: "18px 20px",
};

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [user, setUser] = useState<UserDetail | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [sub, setSub] = useState<SubRow | null>(null);
  const [loading, setLoading] = useState(true);

  const [planEdit, setPlanEdit] = useState("");
  const [memoEdit, setMemoEdit] = useState("");
  const [extendDate, setExtendDate] = useState("");
  const [saving, setSaving] = useState(false);

  const [modal, setModal] = useState<"deactivate" | "activate" | null>(null);
  const [modalReason, setModalReason] = useState("");

  useEffect(() => {
    fetch(`/api/admin/users/${id}`)
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: planEdit, adminMemo: memoEdit, currentPeriodEnd: extendDate || undefined, reason: "어드민 수동 변경" }),
    });
    setSaving(false);
    setUser((prev) => prev ? { ...prev, plan: planEdit, adminMemo: memoEdit } : prev);
  }

  async function handleAction(action: "deactivate" | "activate") {
    await fetch(`/api/admin/users/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason: modalReason }),
    });
    setUser((prev) => prev ? { ...prev, isActive: action === "activate" } : prev);
    setModal(null);
    setModalReason("");
  }

  if (loading) return <div style={{ color: "#94A3B8", textAlign: "center", padding: "80px 0" }}>로딩 중...</div>;
  if (!user) return <div style={{ color: "#DC2626", textAlign: "center", padding: "80px 0" }}>사용자를 찾을 수 없습니다.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>
        사용자 상세 — <span style={{ color: "#64748B", fontWeight: 400, fontSize: 15 }}>{user.bizName}</span>
      </h1>

      {/* 기본 정보 */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: "#64748B", marginBottom: 12 }}>기본 정보</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[["사업자번호", user.bizNo], ["상호명", user.bizName], ["대표자", user.ownerName],
            ["가입일", user.createdAt.slice(0, 10)], ["알림 이메일", user.notifyEmail ?? "-"], ["알림 전화", user.notifyPhone ?? "-"]].map(([label, val]) => (
            <div key={label}>
              <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 500 }}>{label}</span>
              <p style={{ fontSize: 13, color: "#0F172A", marginTop: 3 }}>{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 플랜 / 구독 */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: "#64748B", marginBottom: 14 }}>플랜 / 구독 관리</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: "#64748B", display: "block", marginBottom: 5 }}>플랜</label>
            <select value={planEdit} onChange={(e) => setPlanEdit(e.target.value)} style={inputStyle}>
              {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#64748B", display: "block", marginBottom: 5 }}>구독 만료일</label>
            <input type="date" value={extendDate} onChange={(e) => setExtendDate(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 12, color: "#64748B", display: "block", marginBottom: 5 }}>어드민 메모</label>
          <textarea value={memoEdit} onChange={(e) => setMemoEdit(e.target.value)} rows={2}
            style={{ ...inputStyle, height: "auto", padding: "8px 12px", resize: "vertical" }} />
        </div>
        <button onClick={handleSave} disabled={saving}
          style={{ marginTop: 12, padding: "8px 20px", background: saving ? "#94A3B8" : "#1B3A6B", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: saving ? "not-allowed" : "pointer" }}>
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>

      {/* 알림 조건 */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: "#64748B", marginBottom: 10 }}>알림 조건 ({alerts.length}개)</h2>
        {alerts.length === 0 ? <p style={{ fontSize: 13, color: "#94A3B8" }}>알림 조건 없음</p> :
          alerts.map((a) => (
            <div key={a.id} style={{ fontSize: 13, color: "#475569", borderBottom: "1px solid #F1F5F9", padding: "8px 0" }}>
              키워드: {a.keywords.join(", ") || "없음"} / {a.active ? "활성" : "비활성"}
            </div>
          ))}
      </div>

      {/* 위험 구역 */}
      <div style={{ ...sectionStyle, border: "1px solid #FECACA" }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: "#DC2626", marginBottom: 10 }}>위험 구역</h2>
        {user.isActive ? (
          <button onClick={() => setModal("deactivate")}
            style={{ padding: "8px 18px", background: "#FEE2E2", color: "#991B1B", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "1px solid #FECACA", cursor: "pointer" }}>
            계정 비활성화
          </button>
        ) : (
          <button onClick={() => setModal("activate")}
            style={{ padding: "8px 18px", background: "#DCFCE7", color: "#166534", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "1px solid #BBF7D0", cursor: "pointer" }}>
            계정 재활성화
          </button>
        )}
      </div>

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
