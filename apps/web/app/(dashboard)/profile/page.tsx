"use client";
import { useEffect, useState } from "react";

const MAIN_CATEGORIES = ["건설", "전기공사", "정보통신", "소방", "문화재수리", "용역", "물품", "기타"];
const SUB_CATEGORIES = ["토목", "건축", "조경", "수자원", "도로", "철도", "항만", "기계설비", "소방", "전기", "통신"];

interface CompanyProfile {
  bizName: string;
  mainCategory: string;
  subCategories: string[];
  constructionRecords: { year: number; projectName: string; amount: string; client: string }[];
  creditScore: string;
  capitalAmount: string;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<CompanyProfile>({
    bizName: "", mainCategory: "", subCategories: [],
    constructionRecords: [], creditScore: "", capitalAmount: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/profile").then(r => r.json()).then(d => { if (d && !d.error) setProfile(d); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setSaved(false);
    try {
      await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch { console.error("저장 실패"); } finally { setSaving(false); }
  }

  function addRecord() {
    setProfile(p => ({ ...p, constructionRecords: [...p.constructionRecords, { year: new Date().getFullYear(), projectName: "", amount: "", client: "" }] }));
  }
  function removeRecord(i: number) {
    setProfile(p => ({ ...p, constructionRecords: p.constructionRecords.filter((_, j) => j !== i) }));
  }
  function updateRecord(i: number, field: string, val: string) {
    setProfile(p => ({ ...p, constructionRecords: p.constructionRecords.map((r, j) => j === i ? { ...r, [field]: val } : r) }));
  }
  function toggleSub(cat: string) {
    setProfile(p => ({ ...p, subCategories: p.subCategories.includes(cat) ? p.subCategories.filter(c => c !== cat) : [...p.subCategories, cat] }));
  }

  const inp: React.CSSProperties = { height: 44, border: "1.5px solid #E8ECF2", borderRadius: 10, fontSize: 13, padding: "0 12px", color: "#374151", background: "#fff", outline: "none", width: "100%", boxSizing: "border-box" };
  const card: React.CSSProperties = { background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "24px" };
  const label: React.CSSProperties = { fontSize: 12, color: "#6B7280", fontWeight: 500, display: "block", marginBottom: 6 };

  if (loading) return <div style={{ padding: "48px 0", textAlign: "center", color: "#9CA3AF" }}>불러오는 중...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: 0 }}>내 업체 정보</h2>
        <p style={{ fontSize: 13, color: "#64748B", marginTop: 4, marginBottom: 0 }}>업체 실적과 업종을 등록하면 적격심사 자동 판정이 가능합니다.</p>
      </div>

      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* 섹션 1: 기본 정보 */}
        <div style={card}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: "0 0 16px" }}>사업자 기본 정보</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={label}>업체명</label>
              <input value={profile.bizName} onChange={e => setProfile(p => ({ ...p, bizName: e.target.value }))} placeholder="(주)홍길동건설" style={inp} onFocus={e => { (e.target as HTMLInputElement).style.borderColor = "#1B3A6B"; }} onBlur={e => { (e.target as HTMLInputElement).style.borderColor = "#E8ECF2"; }} />
            </div>
            <div>
              <label style={label}>자본금</label>
              <input value={profile.capitalAmount} onChange={e => setProfile(p => ({ ...p, capitalAmount: e.target.value }))} placeholder="예: 500000000" style={inp} onFocus={e => { (e.target as HTMLInputElement).style.borderColor = "#1B3A6B"; }} onBlur={e => { (e.target as HTMLInputElement).style.borderColor = "#E8ECF2"; }} />
            </div>
          </div>
        </div>

        {/* 섹션 2: 보유 업종 */}
        <div style={card}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: "0 0 16px" }}>보유 업종</h3>
          <div style={{ marginBottom: 14 }}>
            <label style={label}>주업종</label>
            <select value={profile.mainCategory} onChange={e => setProfile(p => ({ ...p, mainCategory: e.target.value }))} style={{ ...inp, cursor: "pointer" }}>
              <option value="">주업종 선택</option>
              {MAIN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>부업종 (복수 선택)</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {SUB_CATEGORIES.map(cat => (
                <button key={cat} type="button" onClick={() => toggleSub(cat)} style={{ padding: "6px 14px", borderRadius: 99, fontSize: 12, fontWeight: profile.subCategories.includes(cat) ? 600 : 400, background: profile.subCategories.includes(cat) ? "#1B3A6B" : "#F1F5F9", color: profile.subCategories.includes(cat) ? "#fff" : "#374151", border: "none", cursor: "pointer" }}>{cat}</button>
              ))}
            </div>
          </div>
        </div>

        {/* 섹션 3: 시공 실적 */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: 0 }}>시공 실적</h3>
            <button type="button" onClick={addRecord} style={{ background: "#F0F2F5", border: "1px solid #E8ECF2", borderRadius: 8, padding: "6px 14px", fontSize: 13, color: "#1B3A6B", fontWeight: 600, cursor: "pointer" }}>+ 실적 추가</button>
          </div>
          {profile.constructionRecords.length === 0 ? (
            <div style={{ textAlign: "center", color: "#9CA3AF", fontSize: 13, padding: "24px 0" }}>등록된 시공 실적이 없습니다. 위 버튼으로 추가하세요.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {profile.constructionRecords.map((rec, i) => (
                <div key={i} style={{ background: "#F8FAFC", borderRadius: 10, padding: "14px", border: "1px solid #E8ECF2" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
                    <div><label style={label}>연도</label><input type="number" value={rec.year} onChange={e => updateRecord(i, "year", e.target.value)} style={{ ...inp, paddingRight: 8 }} /></div>
                    <div><label style={label}>공사명</label><input value={rec.projectName} onChange={e => updateRecord(i, "projectName", e.target.value)} placeholder="OO도로 개설공사" style={inp} /></div>
                    <div><label style={label}>계약금액 (원)</label><input value={rec.amount} onChange={e => updateRecord(i, "amount", e.target.value)} placeholder="500000000" style={inp} /></div>
                    <div><label style={label}>발주처</label><input value={rec.client} onChange={e => updateRecord(i, "client", e.target.value)} placeholder="OO시청" style={inp} /></div>
                    <button type="button" onClick={() => removeRecord(i)} style={{ height: 44, width: 36, background: "#FEF2F2", border: "none", borderRadius: 8, color: "#DC2626", fontSize: 16, cursor: "pointer", flexShrink: 0 }}>×</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 저장 버튼 */}
        <button type="submit" disabled={saving} style={{ height: 50, background: saving ? "#94A3B8" : "#1B3A6B", color: "#fff", borderRadius: 12, fontSize: 15, fontWeight: 700, border: "none", cursor: saving ? "not-allowed" : "pointer" }}>
          {saved ? "✓ 저장 완료!" : saving ? "저장 중..." : "업체 정보 저장"}
        </button>
      </form>
    </div>
  );
}
