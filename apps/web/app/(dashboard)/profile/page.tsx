"use client";
import { useEffect, useState } from "react";

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const MAIN_CATEGORIES = [
  "토목공사업", "건축공사업", "토목건축공사업", "산업·환경설비공사업",
  "조경공사업", "전문건설업", "전기공사업", "정보통신공사업",
  "소방시설공사업", "문화재수리업", "용역", "물품", "기타",
];

const SUB_CATEGORIES = [
  "토목", "건축", "조경", "수자원", "도로", "철도", "항만", "교량",
  "터널", "상하수도", "기계설비", "소방", "전기", "통신", "철강",
];

// 건설산업기본법 기준 건설업 면허업종
const LICENSE_TYPES = [
  "토목공사업", "건축공사업", "토목건축공사업", "산업·환경설비공사업", "조경공사업",
  "실내건축공사업", "토공사업", "미장방수공사업", "타일·돌공사업", "도장공사업",
  "비계·구조물해체공사업", "금속구조물·창호·온실공사업", "지붕판금·건축물조립공사업",
  "방수공사업", "조적공사업", "온돌공사업", "철근·콘크리트공사업",
  "구조물해체·비계공사업", "상·하수도설비공사업", "철도·궤도공사업", "포장공사업",
  "수중공사업", "준설공사업", "철강구조물공사업", "삭도설치공사업", "승강기설치공사업",
  "가스시설공사업", "난방공사업", "전문소방시설공사업",
];

const CREDIT_SCORES = ["AAA", "AA", "A", "BBB", "BB", "B", "CCC", "CC", "C", "D"];

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface License {
  licenseType: string;
  licenseNo:   string;
  registAt:    string;
  gradeNm:     string;
  validYn:     string;
}

interface ConstructionRecord {
  year:           number;
  projectName:    string;
  amount:         string;
  client:         string;
  contractDate:   string;
  completionDate: string;
  category:       string;
}

interface CompanyProfile {
  bizNo:              string;
  bizName:            string;
  ceoName:            string;
  address:            string;
  establishedAt:      string;
  employeeCount:      string;
  mainCategory:       string;
  subCategories:      string[];
  licenses:           License[];
  capitalAmount:      string;
  creditScore:        string;
  constructionRecords: ConstructionRecord[];
}

const EMPTY_PROFILE: CompanyProfile = {
  bizNo: "", bizName: "", ceoName: "", address: "",
  establishedAt: "", employeeCount: "",
  mainCategory: "", subCategories: [],
  licenses: [], capitalAmount: "", creditScore: "",
  constructionRecords: [],
};

// ─── 자본금 한글 변환 ─────────────────────────────────────────────────────────

function formatKorean(amount: string): string {
  const n = parseInt(amount.replace(/[^0-9]/g, ""), 10);
  if (isNaN(n) || n === 0) return "";
  const 조 = Math.floor(n / 1_000_000_000_000);
  const 억 = Math.floor((n % 1_000_000_000_000) / 100_000_000);
  const 만 = Math.floor((n % 100_000_000) / 10_000);
  const parts: string[] = [];
  if (조) parts.push(`${조}조`);
  if (억) parts.push(`${억}억`);
  if (만) parts.push(`${만}만`);
  return parts.length ? parts.join(" ") + "원" : "";
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [profile, setProfile] = useState<CompanyProfile>(EMPTY_PROFILE);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [saveError,  setSaveError]  = useState("");

  // G2B 불러오기 상태
  const [importBizNo,  setImportBizNo]  = useState("");
  const [importing,    setImporting]    = useState(false);
  const [importError,  setImportError]  = useState("");
  const [importOk,     setImportOk]     = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then(r => r.json())
      .then(d => {
        if (d && !d.error) {
          setProfile({
            ...EMPTY_PROFILE,
            ...d,
            subCategories:       Array.isArray(d.subCategories)       ? d.subCategories       : [],
            licenses:            Array.isArray(d.licenses)            ? d.licenses            : [],
            constructionRecords: Array.isArray(d.constructionRecords) ? d.constructionRecords.map(normalizeRecord) : [],
            capitalAmount:       d.capitalAmount ? String(d.capitalAmount) : "",
            employeeCount:       d.employeeCount ? String(d.employeeCount) : "",
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function normalizeRecord(r: Partial<ConstructionRecord>): ConstructionRecord {
    return {
      year:           r.year           ?? new Date().getFullYear(),
      projectName:    r.projectName    ?? "",
      amount:         r.amount         ?? "",
      client:         r.client         ?? "",
      contractDate:   r.contractDate   ?? "",
      completionDate: r.completionDate ?? "",
      category:       r.category       ?? "",
    };
  }

  async function handleG2BImport() {
    const clean = importBizNo.replace(/[^0-9]/g, "");
    if (clean.length !== 10) { setImportError("사업자번호 10자리를 입력하세요"); return; }
    setImporting(true); setImportError(""); setImportOk(false);
    try {
      const res  = await fetch(`/api/profile/g2b-import?bizNo=${clean}`);
      const data = await res.json();
      if (!res.ok) { setImportError(data.error ?? "불러오기 실패"); return; }

      const { companyInfo, contracts } = data;
      setProfile(p => ({
        ...p,
        bizNo:         clean,
        bizName:       companyInfo.bizName       || p.bizName,
        ceoName:       companyInfo.ceoName        || p.ceoName,
        address:       companyInfo.address        || p.address,
        establishedAt: companyInfo.establishedAt  || p.establishedAt,
        employeeCount: companyInfo.employeeCount  ? String(companyInfo.employeeCount) : p.employeeCount,
        capitalAmount: companyInfo.capitalAmount  ? String(companyInfo.capitalAmount) : p.capitalAmount,
        licenses:      companyInfo.licenses.length ? companyInfo.licenses : p.licenses,
        constructionRecords: contracts.length
          ? contracts.map((c: { projectName: string; client: string; amount: string; contractDate: string; completionDate: string; category: string; year: number }) => ({
              year:           c.year,
              projectName:    c.projectName,
              amount:         c.amount,
              client:         c.client,
              contractDate:   c.contractDate,
              completionDate: c.completionDate,
              category:       c.category,
            }))
          : p.constructionRecords,
      }));
      setImportOk(true);
    } catch { setImportError("네트워크 오류가 발생했습니다"); }
    finally { setImporting(false); }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setSaved(false); setSaveError("");
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...profile,
          capitalAmount: profile.capitalAmount ? BigInt(profile.capitalAmount.replace(/[^0-9]/g, "")).toString() : null,
          employeeCount: profile.employeeCount  ? parseInt(profile.employeeCount, 10) : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error ?? `저장 실패 (${res.status})`);
        return;
      }
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch { setSaveError("네트워크 오류로 저장하지 못했습니다."); }
    finally { setSaving(false); }
  }

  // 면허 조작
  function addLicense() {
    setProfile(p => ({ ...p, licenses: [...p.licenses, { licenseType: "", licenseNo: "", registAt: "", gradeNm: "", validYn: "Y" }] }));
  }
  function removeLicense(i: number) {
    setProfile(p => ({ ...p, licenses: p.licenses.filter((_, j) => j !== i) }));
  }
  function updateLicense(i: number, field: keyof License, val: string) {
    setProfile(p => ({ ...p, licenses: p.licenses.map((l, j) => j === i ? { ...l, [field]: val } : l) }));
  }

  // 시공 실적 조작
  function addRecord() {
    setProfile(p => ({ ...p, constructionRecords: [...p.constructionRecords, { year: new Date().getFullYear(), projectName: "", amount: "", client: "", contractDate: "", completionDate: "", category: "" }] }));
  }
  function removeRecord(i: number) {
    setProfile(p => ({ ...p, constructionRecords: p.constructionRecords.filter((_, j) => j !== i) }));
  }
  function updateRecord(i: number, field: keyof ConstructionRecord, val: string | number) {
    setProfile(p => ({ ...p, constructionRecords: p.constructionRecords.map((r, j) => j === i ? { ...r, [field]: val } : r) }));
  }
  function toggleSub(cat: string) {
    setProfile(p => ({ ...p, subCategories: p.subCategories.includes(cat) ? p.subCategories.filter(c => c !== cat) : [...p.subCategories, cat] }));
  }

  // ─── 스타일 ─────────────────────────────────────────────────────────────────
  const inp: React.CSSProperties = { height: 44, border: "1.5px solid #E8ECF2", borderRadius: 10, fontSize: 13, padding: "0 12px", color: "#374151", background: "#fff", outline: "none", width: "100%", boxSizing: "border-box" };
  const card: React.CSSProperties = { background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "24px" };
  const lbl: React.CSSProperties = { fontSize: 12, color: "#6B7280", fontWeight: 500, display: "block", marginBottom: 6 };
  function focusStyle(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) { e.target.style.borderColor = "#1B3A6B"; }
  function blurStyle(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) { e.target.style.borderColor = "#E8ECF2"; }

  if (loading) return <div style={{ padding: "48px 0", textAlign: "center", color: "#9CA3AF" }}>불러오는 중...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: 0 }}>내 업체 정보</h2>
        <p style={{ fontSize: 13, color: "#64748B", marginTop: 4, marginBottom: 0 }}>업체 실적과 업종을 등록하면 적격심사 자동 판정이 가능합니다.</p>
      </div>

      {/* ── G2B 자동 불러오기 배너 ── */}
      <div style={{ ...card, background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1E40AF", margin: "0 0 4px" }}>나라장터에서 자동 불러오기</h3>
        <p style={{ fontSize: 12, color: "#3B82F6", margin: "0 0 14px" }}>사업자번호를 입력하면 업체 기본정보·면허·시공 실적을 자동으로 채워드립니다.</p>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            value={importBizNo}
            onChange={e => setImportBizNo(e.target.value)}
            placeholder="사업자번호 10자리 (숫자만)"
            maxLength={12}
            style={{ ...inp, flex: 1, background: "#fff", maxWidth: 280 }}
            onFocus={focusStyle} onBlur={blurStyle}
          />
          <button type="button" onClick={handleG2BImport} disabled={importing}
            style={{ height: 44, padding: "0 20px", background: importing ? "#93C5FD" : "#1D4ED8", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: importing ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
            {importing ? "불러오는 중..." : "나라장터에서 불러오기"}
          </button>
        </div>
        {importError && <p style={{ fontSize: 12, color: "#DC2626", margin: "8px 0 0" }}>{importError}</p>}
        {importOk    && <p style={{ fontSize: 12, color: "#16A34A", margin: "8px 0 0" }}>✓ 정보를 성공적으로 불러왔습니다. 확인 후 저장해주세요.</p>}
      </div>

      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── 섹션 1: 사업자 기본 정보 ── */}
        <div style={card}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: "0 0 16px" }}>사업자 기본 정보</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={lbl}>업체명</label>
              <input value={profile.bizName} onChange={e => setProfile(p => ({ ...p, bizName: e.target.value }))} placeholder="(주)홍길동건설" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
            </div>
            <div>
              <label style={lbl}>사업자등록번호</label>
              <input value={profile.bizNo} onChange={e => setProfile(p => ({ ...p, bizNo: e.target.value.replace(/[^0-9]/g, "") }))} placeholder="1234567890" maxLength={10} style={inp} onFocus={focusStyle} onBlur={blurStyle} />
            </div>
            <div>
              <label style={lbl}>대표자명</label>
              <input value={profile.ceoName} onChange={e => setProfile(p => ({ ...p, ceoName: e.target.value }))} placeholder="홍길동" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
            </div>
            <div>
              <label style={lbl}>설립일</label>
              <input value={profile.establishedAt} onChange={e => setProfile(p => ({ ...p, establishedAt: e.target.value.replace(/[^0-9]/g, "") }))} placeholder="YYYYMMDD" maxLength={8} style={inp} onFocus={focusStyle} onBlur={blurStyle} />
            </div>
            <div>
              <label style={lbl}>임직원 수</label>
              <input type="number" min={0} value={profile.employeeCount} onChange={e => setProfile(p => ({ ...p, employeeCount: e.target.value }))} placeholder="예: 25" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
            </div>
            <div>
              <label style={lbl}>자본금 (원)</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input value={profile.capitalAmount} onChange={e => setProfile(p => ({ ...p, capitalAmount: e.target.value.replace(/[^0-9]/g, "") }))} placeholder="500000000" style={{ ...inp, flex: 1 }} onFocus={focusStyle} onBlur={blurStyle} />
                {profile.capitalAmount && (
                  <span style={{ fontSize: 13, color: "#1B3A6B", fontWeight: 600, whiteSpace: "nowrap" }}>{formatKorean(profile.capitalAmount)}</span>
                )}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={lbl}>소재지 (주소)</label>
            <input value={profile.address} onChange={e => setProfile(p => ({ ...p, address: e.target.value }))} placeholder="서울특별시 강남구 ..." style={inp} onFocus={focusStyle} onBlur={blurStyle} />
          </div>
        </div>

        {/* ── 섹션 2: 신용 정보 ── */}
        <div style={card}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: "0 0 16px" }}>신용 정보</h3>
          <div style={{ maxWidth: 200 }}>
            <label style={lbl}>신용등급</label>
            <select value={profile.creditScore} onChange={e => setProfile(p => ({ ...p, creditScore: e.target.value }))} style={{ ...inp, cursor: "pointer" }} onFocus={focusStyle} onBlur={blurStyle}>
              <option value="">등급 선택</option>
              {CREDIT_SCORES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* ── 섹션 3: 보유 면허 (자격요건) ── */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: 0 }}>보유 면허 (건설업 면허)</h3>
              <p style={{ fontSize: 12, color: "#64748B", margin: "4px 0 0" }}>적격심사 시 면허 업종·등급을 기준으로 자격 판단에 활용됩니다.</p>
            </div>
            <button type="button" onClick={addLicense} style={{ background: "#F0F2F5", border: "1px solid #E8ECF2", borderRadius: 8, padding: "6px 14px", fontSize: 13, color: "#1B3A6B", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>+ 면허 추가</button>
          </div>
          {profile.licenses.length === 0 ? (
            <div style={{ textAlign: "center", color: "#9CA3AF", fontSize: 13, padding: "24px 0" }}>등록된 면허가 없습니다. 위 버튼으로 추가하세요.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {profile.licenses.map((lic, i) => (
                <div key={i} style={{ background: "#F8FAFC", borderRadius: 10, padding: "14px", border: "1px solid #E8ECF2" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr 1fr 80px auto", gap: 10, alignItems: "end" }}>
                    <div>
                      <label style={lbl}>면허업종</label>
                      <select value={lic.licenseType} onChange={e => updateLicense(i, "licenseType", e.target.value)} style={{ ...inp, cursor: "pointer", fontSize: 12 }} onFocus={focusStyle} onBlur={blurStyle}>
                        <option value="">업종 선택</option>
                        {LICENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>면허번호</label>
                      <input value={lic.licenseNo} onChange={e => updateLicense(i, "licenseNo", e.target.value)} placeholder="면허번호" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
                    </div>
                    <div>
                      <label style={lbl}>등록일</label>
                      <input value={lic.registAt} onChange={e => updateLicense(i, "registAt", e.target.value.replace(/[^0-9]/g, ""))} placeholder="YYYYMMDD" maxLength={8} style={inp} onFocus={focusStyle} onBlur={blurStyle} />
                    </div>
                    <div>
                      <label style={lbl}>등급</label>
                      <input value={lic.gradeNm} onChange={e => updateLicense(i, "gradeNm", e.target.value)} placeholder="특급/1급 등" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
                    </div>
                    <div>
                      <label style={lbl}>유효여부</label>
                      <select value={lic.validYn} onChange={e => updateLicense(i, "validYn", e.target.value)} style={{ ...inp, cursor: "pointer" }} onFocus={focusStyle} onBlur={blurStyle}>
                        <option value="Y">유효</option>
                        <option value="N">만료</option>
                      </select>
                    </div>
                    <button type="button" onClick={() => removeLicense(i)} style={{ height: 44, width: 36, background: "#FEF2F2", border: "none", borderRadius: 8, color: "#DC2626", fontSize: 16, cursor: "pointer", flexShrink: 0, alignSelf: "flex-end" }}>×</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 섹션 4: 보유 업종 ── */}
        <div style={card}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: "0 0 16px" }}>보유 업종</h3>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>주업종</label>
            <select value={profile.mainCategory} onChange={e => setProfile(p => ({ ...p, mainCategory: e.target.value }))} style={{ ...inp, cursor: "pointer", maxWidth: 280 }} onFocus={focusStyle} onBlur={blurStyle}>
              <option value="">주업종 선택</option>
              {MAIN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>부업종 (복수 선택)</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {SUB_CATEGORIES.map(cat => (
                <button key={cat} type="button" onClick={() => toggleSub(cat)}
                  style={{ padding: "6px 14px", borderRadius: 99, fontSize: 12, fontWeight: profile.subCategories.includes(cat) ? 600 : 400, background: profile.subCategories.includes(cat) ? "#1B3A6B" : "#F1F5F9", color: profile.subCategories.includes(cat) ? "#fff" : "#374151", border: "none", cursor: "pointer" }}>
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── 섹션 5: 시공 실적 ── */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: 0 }}>시공 실적</h3>
              <p style={{ fontSize: 12, color: "#64748B", margin: "4px 0 0" }}>나라장터 불러오기로 자동 입력되거나 수동으로 추가할 수 있습니다.</p>
            </div>
            <button type="button" onClick={addRecord} style={{ background: "#F0F2F5", border: "1px solid #E8ECF2", borderRadius: 8, padding: "6px 14px", fontSize: 13, color: "#1B3A6B", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>+ 실적 추가</button>
          </div>
          {profile.constructionRecords.length === 0 ? (
            <div style={{ textAlign: "center", color: "#9CA3AF", fontSize: 13, padding: "24px 0" }}>등록된 시공 실적이 없습니다.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {profile.constructionRecords.map((rec, i) => (
                <div key={i} style={{ background: "#F8FAFC", borderRadius: 10, padding: "14px", border: "1px solid #E8ECF2" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "70px 2fr 1.2fr 1.2fr auto", gap: 10, alignItems: "end", marginBottom: 10 }}>
                    <div>
                      <label style={lbl}>연도</label>
                      <input type="number" value={rec.year} onChange={e => updateRecord(i, "year", parseInt(e.target.value, 10))} style={{ ...inp, paddingRight: 4 }} onFocus={focusStyle} onBlur={blurStyle} />
                    </div>
                    <div>
                      <label style={lbl}>공사명</label>
                      <input value={rec.projectName} onChange={e => updateRecord(i, "projectName", e.target.value)} placeholder="OO도로 개설공사" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
                    </div>
                    <div>
                      <label style={lbl}>계약금액 (원)</label>
                      <input value={rec.amount} onChange={e => updateRecord(i, "amount", e.target.value.replace(/[^0-9]/g, ""))} placeholder="500000000" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
                    </div>
                    <div>
                      <label style={lbl}>발주처</label>
                      <input value={rec.client} onChange={e => updateRecord(i, "client", e.target.value)} placeholder="OO시청" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
                    </div>
                    <button type="button" onClick={() => removeRecord(i)} style={{ height: 44, width: 36, background: "#FEF2F2", border: "none", borderRadius: 8, color: "#DC2626", fontSize: 16, cursor: "pointer", flexShrink: 0 }}>×</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={lbl}>계약일 (YYYYMMDD)</label>
                      <input value={rec.contractDate} onChange={e => updateRecord(i, "contractDate", e.target.value.replace(/[^0-9]/g, ""))} placeholder="20230101" maxLength={8} style={inp} onFocus={focusStyle} onBlur={blurStyle} />
                    </div>
                    <div>
                      <label style={lbl}>준공일 (YYYYMMDD)</label>
                      <input value={rec.completionDate} onChange={e => updateRecord(i, "completionDate", e.target.value.replace(/[^0-9]/g, ""))} placeholder="20231231" maxLength={8} style={inp} onFocus={focusStyle} onBlur={blurStyle} />
                    </div>
                    <div>
                      <label style={lbl}>업종</label>
                      <input value={rec.category} onChange={e => updateRecord(i, "category", e.target.value)} placeholder="토목공사" style={inp} onFocus={focusStyle} onBlur={blurStyle} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 저장 에러 ── */}
        {saveError && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#DC2626", fontWeight: 500 }}>
            ⚠ {saveError}
          </div>
        )}
        {/* ── 저장 버튼 ── */}
        <button type="submit" disabled={saving}
          style={{ height: 50, width: "100%", background: saving ? "#94A3B8" : "#1B3A6B", color: "#fff", borderRadius: 12, fontSize: 15, fontWeight: 700, border: "none", cursor: saving ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
          {saved ? "✓ 저장 완료!" : saving ? "저장 중..." : "업체 정보 저장"}
        </button>
      </form>
    </div>
  );
}
