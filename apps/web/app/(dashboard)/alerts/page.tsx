"use client";

import { useState, useEffect } from "react";

interface UserAlert {
  id: string;
  keywords: string[];
  categories: string[];
  regions: string[];
  minBudget: string | null;
  maxBudget: string | null;
  active: boolean;
}

const CATEGORIES = ["건설", "용역", "물품", "기타"];
const REGIONS = ["서울", "경기", "인천", "부산", "대구", "광주", "대전", "강원", "충남", "전북", "전남", "경북", "경남", "제주"];

const card: React.CSSProperties = {
  background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "24px",
};
const inp: React.CSSProperties = {
  height: 44, border: "1.5px solid #E8ECF2", borderRadius: 10,
  fontSize: 13, padding: "0 12px", color: "#374151",
  background: "#fff", outline: "none", width: "100%", boxSizing: "border-box",
};
const lbl: React.CSSProperties = {
  fontSize: 12, color: "#6B7280", fontWeight: 500, display: "block", marginBottom: 6,
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<UserAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [keywords, setKeywords] = useState("");
  const [selCategories, setSelCategories] = useState<string[]>([]);
  const [selRegions, setSelRegions] = useState<string[]>([]);
  const [minBudget, setMinBudget] = useState("");
  const [maxBudget, setMaxBudget] = useState("");

  useEffect(() => {
    fetch("/api/alerts")
      .then((r) => r.json())
      .then((d: { data: UserAlert[] }) => setAlerts(d.data ?? []))
      .catch(() => console.error("알림 목록 불러오기 실패"))
      .finally(() => setLoading(false));
  }, []);

  function toggleArr(arr: string[], val: string): string[] {
    return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
          categories: selCategories,
          regions: selRegions,
          minBudget: minBudget || null,
          maxBudget: maxBudget || null,
        }),
      });
      const data = (await res.json()) as { data?: UserAlert; error?: string };
      if (data.data) {
        setAlerts((prev) => [...prev, data.data!]);
        setShowForm(false);
        setKeywords(""); setSelCategories([]); setSelRegions([]); setMinBudget(""); setMaxBudget("");
      }
    } catch {
      console.error("알림 저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/alerts?id=${id}`, { method: "DELETE" });
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>알림 설정</h2>
          <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>조건에 맞는 신규 공고를 이메일로 받아보세요.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          disabled={showForm}
          style={{
            height: 42, padding: "0 18px", background: showForm ? "#CBD5E1" : "#1B3A6B",
            color: "#fff", borderRadius: 10, fontSize: 14, fontWeight: 600,
            border: "none", cursor: showForm ? "not-allowed" : "pointer",
          }}
        >
          + 알림 추가
        </button>
      </div>

      {showForm && (
        <div style={card}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: "0 0 20px" }}>새 알림 조건</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={lbl}>키워드 (쉼표로 구분)</label>
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="도로포장, 하수도, 조경"
                style={inp}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = "#1B3A6B"; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = "#E8ECF2"; }}
              />
            </div>

            <div>
              <label style={lbl}>업종</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelCategories(toggleArr(selCategories, c))}
                    style={{
                      padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500,
                      border: selCategories.includes(c) ? "1.5px solid #1B3A6B" : "1.5px solid #E8ECF2",
                      background: selCategories.includes(c) ? "#1B3A6B" : "#fff",
                      color: selCategories.includes(c) ? "#fff" : "#374151",
                      cursor: "pointer",
                    }}
                  >{c}</button>
                ))}
              </div>
            </div>

            <div>
              <label style={lbl}>지역</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {REGIONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setSelRegions(toggleArr(selRegions, r))}
                    style={{
                      padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500,
                      border: selRegions.includes(r) ? "1.5px solid #1B3A6B" : "1.5px solid #E8ECF2",
                      background: selRegions.includes(r) ? "#1B3A6B" : "#fff",
                      color: selRegions.includes(r) ? "#fff" : "#374151",
                      cursor: "pointer",
                    }}
                  >{r}</button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={lbl}>최소 금액 (원)</label>
                <input
                  type="number"
                  value={minBudget}
                  onChange={(e) => setMinBudget(e.target.value)}
                  placeholder="100000000"
                  style={inp}
                  onFocus={e => { (e.target as HTMLInputElement).style.borderColor = "#1B3A6B"; }}
                  onBlur={e => { (e.target as HTMLInputElement).style.borderColor = "#E8ECF2"; }}
                />
              </div>
              <div>
                <label style={lbl}>최대 금액 (원)</label>
                <input
                  type="number"
                  value={maxBudget}
                  onChange={(e) => setMaxBudget(e.target.value)}
                  placeholder="1000000000"
                  style={inp}
                  onFocus={e => { (e.target as HTMLInputElement).style.borderColor = "#1B3A6B"; }}
                  onBlur={e => { (e.target as HTMLInputElement).style.borderColor = "#E8ECF2"; }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  height: 44, padding: "0 24px",
                  background: saving ? "#CBD5E1" : "#1B3A6B",
                  color: "#fff", borderRadius: 10, fontSize: 14, fontWeight: 600,
                  border: "none", cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "저장 중..." : "저장"}
              </button>
              <button
                onClick={() => setShowForm(false)}
                style={{
                  height: 44, padding: "0 24px",
                  background: "#fff", color: "#374151", borderRadius: 10,
                  fontSize: 14, fontWeight: 600, border: "1.5px solid #E8ECF2", cursor: "pointer",
                }}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: "48px 0", textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
          불러오는 중...
        </div>
      ) : alerts.length === 0 ? (
        <div style={{ ...card, padding: "48px 24px", textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
          설정된 알림이 없습니다. 알림을 추가해주세요.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {alerts.map((alert) => (
            <div key={alert.id} style={{ ...card, padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                  {alert.keywords.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {alert.keywords.map((k) => (
                        <span key={k} style={{
                          padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                          background: "#EEF2FF", color: "#1B3A6B",
                        }}>{k}</span>
                      ))}
                    </div>
                  )}
                  {(alert.categories.length > 0 || alert.regions.length > 0) && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {alert.categories.map((c) => (
                        <span key={c} style={{
                          padding: "3px 10px", borderRadius: 20, fontSize: 12,
                          border: "1px solid #E8ECF2", color: "#374151",
                        }}>{c}</span>
                      ))}
                      {alert.regions.map((r) => (
                        <span key={r} style={{
                          padding: "3px 10px", borderRadius: 20, fontSize: 12,
                          border: "1px solid #E8ECF2", color: "#374151",
                        }}>{r}</span>
                      ))}
                    </div>
                  )}
                  {(alert.minBudget || alert.maxBudget) && (
                    <div style={{ fontSize: 12, color: "#94A3B8" }}>
                      금액: {alert.minBudget ? parseInt(alert.minBudget).toLocaleString() + "원" : "제한없음"} ~{" "}
                      {alert.maxBudget ? parseInt(alert.maxBudget).toLocaleString() + "원" : "제한없음"}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(alert.id)}
                  style={{
                    height: 34, padding: "0 14px", background: "#FEF2F2",
                    color: "#DC2626", borderRadius: 8, fontSize: 13, fontWeight: 600,
                    border: "none", cursor: "pointer", flexShrink: 0,
                  }}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
