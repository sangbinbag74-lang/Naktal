"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SettingsPage() {
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyPhone, setNotifyPhone] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [plan, setPlan] = useState("FREE");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setLoginEmail(user.email ?? "");
      const meta = user.user_metadata as Record<string, string> | undefined;
      if (meta?.notifyEmail) setNotifyEmail(meta.notifyEmail);
      if (meta?.notifyPhone) setNotifyPhone(meta.notifyPhone);
    });
    fetch("/api/dashboard/stats").then(r => r.json()).then(d => {
      if (d?.core1Limit === 30) setPlan("STANDARD");
      else if (d?.core1Limit === -1) setPlan("PRO");
    }).catch(() => {});
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const supabase = createClient();
      await supabase.auth.updateUser({ data: { notifyEmail, notifyPhone } });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  const planLabels: Record<string, { label: string; color: string; bg: string }> = {
    FREE:     { label: "무료",     color: "#475569", bg: "#F1F5F9" },
    STANDARD: { label: "스탠다드", color: "#1B3A6B", bg: "#EFF6FF" },
    PRO:      { label: "프로",     color: "#059669", bg: "#F0FDF4" },
  };
  const planInfo = planLabels[plan] ?? planLabels["FREE"]!;

  const inp: React.CSSProperties = {
    height: 44, border: "1.5px solid #E8ECF2", borderRadius: 10,
    fontSize: 13, padding: "0 12px", color: "#374151",
    background: "#fff", outline: "none", width: "100%", boxSizing: "border-box",
  };
  const card: React.CSSProperties = {
    background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "24px",
  };
  const lbl: React.CSSProperties = {
    fontSize: 12, color: "#6B7280", fontWeight: 500, display: "block", marginBottom: 6,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: 0 }}>설정</h2>
        <p style={{ fontSize: 13, color: "#64748B", marginTop: 4, marginBottom: 0 }}>
          계정 및 알림 수신 정보를 관리합니다.
        </p>
      </div>

      <div style={card}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: "0 0 16px" }}>계정 정보</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={lbl}>로그인 계정 (사업자번호)</label>
            <div style={{
              ...inp, display: "flex", alignItems: "center",
              background: "#F8FAFC", color: "#94A3B8",
            }}>
              {loginEmail.replace("@naktal.biz", "") || "—"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div>
              <label style={lbl}>현재 플랜</label>
              <span style={{
                display: "inline-block", padding: "4px 12px", borderRadius: 99,
                fontSize: 13, fontWeight: 600,
                color: planInfo.color, background: planInfo.bg,
              }}>
                {planInfo.label}
              </span>
            </div>
            {plan !== "PRO" && (
              <a href="/pricing" style={{
                marginTop: 18, fontSize: 12, fontWeight: 600, color: "#60A5FA", textDecoration: "none",
              }}>
                업그레이드 →
              </a>
            )}
          </div>
        </div>
      </div>

      <div style={card}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>알림 수신 설정</h3>
        <p style={{ fontSize: 12, color: "#94A3B8", margin: "0 0 16px" }}>
          마감 임박 공고 및 입찰 결과 알림을 받을 연락처입니다.
        </p>
        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={lbl}>알림 이메일 <span style={{ color: "#CBD5E1" }}>(선택)</span></label>
            <input
              type="email"
              value={notifyEmail}
              onChange={e => setNotifyEmail(e.target.value)}
              placeholder="example@email.com"
              style={inp}
              onFocus={e => { (e.target as HTMLInputElement).style.borderColor = "#1B3A6B"; }}
              onBlur={e => { (e.target as HTMLInputElement).style.borderColor = "#E8ECF2"; }}
            />
          </div>
          <div>
            <label style={lbl}>알림 전화번호 <span style={{ color: "#CBD5E1" }}>(선택)</span></label>
            <input
              type="tel"
              value={notifyPhone}
              onChange={e => setNotifyPhone(e.target.value)}
              placeholder="010-0000-0000"
              style={inp}
              onFocus={e => { (e.target as HTMLInputElement).style.borderColor = "#1B3A6B"; }}
              onBlur={e => { (e.target as HTMLInputElement).style.borderColor = "#E8ECF2"; }}
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            style={{
              height: 44, background: saving ? "#94A3B8" : "#1B3A6B",
              color: "#fff", borderRadius: 10, fontSize: 14, fontWeight: 600,
              border: "none", cursor: saving ? "not-allowed" : "pointer",
              alignSelf: "flex-start", padding: "0 24px",
            }}
          >
            {saved ? "✓ 저장 완료" : saving ? "저장 중..." : "저장"}
          </button>
        </form>
      </div>
    </div>
  );
}
