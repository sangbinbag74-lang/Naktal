"use client";

// 알림 설정 — UserAlert CRUD 연결 (2026-07-09 P1: "준비 중" placeholder → 실기능)
//  매일 09:00 신규 공고 매칭 이메일 발송 (/api/alerts/notify cron)
import { useCallback, useEffect, useState } from "react";

interface AlertRow {
  id: string;
  keywords: string[];
  categories: string[];
  regions: string[];
  minBudget: string | null;
  maxBudget: string | null;
  createdAt: string;
}

interface CompetitorRow { id: string; competitorName: string; createdAt: string }

const CATEGORIES = ["공사", "용역", "물품"];
const REGIONS = [
  "전국", "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시", "울산광역시",
  "세종특별자치시", "경기도", "강원특별자치도", "충청북도", "충청남도", "전북특별자치도", "전라남도",
  "경상북도", "경상남도", "제주특별자치도",
];
const fmtWon = (v: string | null) => (v ? Number(v).toLocaleString("ko-KR") + "원" : null);

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeUrl, setUpgradeUrl] = useState<string | null>(null);

  // 폼
  const [keywords, setKeywords] = useState("");
  const [category, setCategory] = useState("");
  const [region, setRegion] = useState("");
  const [minBudget, setMinBudget] = useState("");
  const [maxBudget, setMaxBudget] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts");
      const data = (await res.json()) as { data: AlertRow[] };
      setAlerts(data.data ?? []);
    } catch { /* 무시 */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate() {
    const kw = keywords.split(",").map((s) => s.trim()).filter(Boolean);
    if (kw.length === 0 && !category && !region) {
      setError("키워드·업종·지역 중 최소 1개는 입력해주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    setUpgradeUrl(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: kw,
          categories: category ? [category] : [],
          regions: region && region !== "전국" ? [region] : [],
          minBudget: minBudget ? String(Number(minBudget)) : null,
          maxBudget: maxBudget ? String(Number(maxBudget)) : null,
        }),
      });
      const data = (await res.json()) as { data?: AlertRow; error?: string; upgradeUrl?: string };
      if (!res.ok) {
        setError(data.error ?? "저장에 실패했습니다.");
        if (data.upgradeUrl) setUpgradeUrl(data.upgradeUrl);
        return;
      }
      setKeywords(""); setCategory(""); setRegion(""); setMinBudget(""); setMaxBudget("");
      void load();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/alerts?id=${id}`, { method: "DELETE" });
    void load();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>알림 설정</h2>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>
          조건에 맞는 신규 공고가 등록되면 매일 오전 이메일로 알려드립니다. (무료 3개 · 라이트 10개 · 프로 무제한)
        </p>
      </div>

      {/* 새 알림 만들기 */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px 22px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 14 }}>새 알림 조건</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: "#374151", fontWeight: 500, display: "block", marginBottom: 5 }}>키워드 (쉼표로 여러 개)</label>
            <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="예: 도로, 포장, 조경" className="naktal-input" style={{ height: 42 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#374151", fontWeight: 500, display: "block", marginBottom: 5 }}>업종</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="naktal-input" style={{ height: 42 }}>
              <option value="">전체</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#374151", fontWeight: 500, display: "block", marginBottom: 5 }}>지역</label>
            <select value={region} onChange={(e) => setRegion(e.target.value)} className="naktal-input" style={{ height: 42 }}>
              <option value="">전체</option>
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#374151", fontWeight: 500, display: "block", marginBottom: 5 }}>기초금액 (원, 선택)</label>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input value={minBudget} onChange={(e) => setMinBudget(e.target.value.replace(/\D/g, ""))} placeholder="최소" className="naktal-input" style={{ height: 42 }} />
              <span style={{ color: "#94A3B8" }}>~</span>
              <input value={maxBudget} onChange={(e) => setMaxBudget(e.target.value.replace(/\D/g, ""))} placeholder="최대" className="naktal-input" style={{ height: 42 }} />
            </div>
          </div>
        </div>
        {error && (
          <div style={{ marginTop: 12, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, color: "#DC2626" }}>
            {error}
            {upgradeUrl && <a href={upgradeUrl} style={{ marginLeft: 8, color: "#1B3A6B", fontWeight: 700 }}>요금제 보기 →</a>}
          </div>
        )}
        <button onClick={() => void handleCreate()} disabled={saving} className="naktal-btn-primary" style={{ marginTop: 14, width: "auto", padding: "0 22px", height: 44 }}>
          {saving ? "저장 중..." : "+ 알림 추가"}
        </button>
      </div>

      {/* 내 알림 목록 */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px 22px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 14 }}>내 알림 ({alerts.length}개)</div>
        {loading ? (
          <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>불러오는 중...</p>
        ) : alerts.length === 0 ? (
          <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>설정된 알림이 없습니다. 위에서 첫 알림을 만들어 보세요.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {alerts.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid #F1F5F9", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ flex: 1, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {a.keywords.map((k) => (
                    <span key={k} style={{ fontSize: 12, fontWeight: 600, color: "#1B3A6B", background: "#EFF6FF", padding: "3px 10px", borderRadius: 99 }}>🔍 {k}</span>
                  ))}
                  {a.categories.map((c) => (
                    <span key={c} style={{ fontSize: 12, fontWeight: 600, color: "#065F46", background: "#ECFDF5", padding: "3px 10px", borderRadius: 99 }}>{c}</span>
                  ))}
                  {a.regions.map((r) => (
                    <span key={r} style={{ fontSize: 12, fontWeight: 600, color: "#7C2D12", background: "#FFF7ED", padding: "3px 10px", borderRadius: 99 }}>📍 {r}</span>
                  ))}
                  {(a.minBudget || a.maxBudget) && (
                    <span style={{ fontSize: 12, color: "#64748B", padding: "3px 4px" }}>
                      {fmtWon(a.minBudget) ?? "0원"} ~ {fmtWon(a.maxBudget) ?? "제한 없음"}
                    </span>
                  )}
                </div>
                <button onClick={() => void handleDelete(a.id)} style={{ fontSize: 12, color: "#DC2626", background: "none", border: "1px solid #FECACA", borderRadius: 6, padding: "5px 10px", cursor: "pointer", flexShrink: 0 }}>
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <CompetitorSection />
    </div>
  );
}

// ── 경쟁사 추적 (전 티어, 개수 차등 — 2026-07-09 P1) ─────────────────────────
function CompetitorSection() {
  const [rows, setRows] = useState<CompetitorRow[]>([]);
  const [limit, setLimit] = useState<number | null>(1);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeUrl, setUpgradeUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/competitors");
      const data = (await res.json()) as { data: CompetitorRow[]; limit: number | null };
      setRows(data.data ?? []);
      setLimit(data.limit ?? null);
    } catch { /* 무시 */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleAdd() {
    if (name.trim().length < 2) { setError("경쟁사 상호명을 2자 이상 입력해주세요."); return; }
    setSaving(true);
    setError(null);
    setUpgradeUrl(null);
    try {
      const res = await fetch("/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = (await res.json()) as { error?: string; upgradeUrl?: string };
      if (!res.ok) {
        setError(data.error ?? "등록에 실패했습니다.");
        if (data.upgradeUrl) setUpgradeUrl(data.upgradeUrl);
        return;
      }
      setName("");
      void load();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally { setSaving(false); }
  }

  async function handleRemove(id: string) {
    await fetch(`/api/competitors?id=${id}`, { method: "DELETE" });
    void load();
  }

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px 22px" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>
        경쟁사 추적 <span style={{ fontSize: 12, fontWeight: 500, color: "#94A3B8" }}>({rows.length}{limit != null ? `/${limit}` : ""}개사)</span>
      </div>
      <p style={{ fontSize: 12.5, color: "#64748B", margin: "0 0 14px" }}>
        추적 중인 경쟁사가 낙찰을 받으면 낙찰가·낙찰률과 함께 이메일로 알려드립니다.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="경쟁사 상호명 (예: 대한건설)" className="naktal-input" style={{ height: 42, flex: 1 }}
          onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }} />
        <button onClick={() => void handleAdd()} disabled={saving} className="naktal-btn-primary" style={{ marginTop: 0, width: "auto", padding: "0 18px", height: 42 }}>
          {saving ? "..." : "추가"}
        </button>
      </div>
      {error && (
        <div style={{ marginTop: 10, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, color: "#DC2626" }}>
          {error}
          {upgradeUrl && <a href={upgradeUrl} style={{ marginLeft: 8, color: "#1B3A6B", fontWeight: 700 }}>요금제 보기 →</a>}
        </div>
      )}
      {rows.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          {rows.map((r) => (
            <span key={r.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#0F172A", background: "#F8FAFC", border: "1px solid #E8ECF2", padding: "6px 10px", borderRadius: 99 }}>
              🏗 {r.competitorName}
              <button onClick={() => void handleRemove(r.id)} style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
