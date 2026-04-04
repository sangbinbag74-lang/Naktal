"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

type Result = "PASS" | "UNCERTAIN" | "FAIL";
interface QualificationResult {
  result: Result;
  reason: string;
  requiredRecord?: string;
  myRecord?: string;
}

const resultConfig: Record<Result, { label: string; icon: string; bg: string; color: string; border: string }> = {
  PASS:      { label: "통과 가능",  icon: "✅", bg: "#F0FDF4", color: "#166534", border: "#86EFAC" },
  UNCERTAIN: { label: "불확실",    icon: "⚠️", bg: "#FFFBEB", color: "#92400E", border: "#FCD34D" },
  FAIL:      { label: "통과 불가", icon: "❌", bg: "#FEF2F2", color: "#991B1B", border: "#FCA5A5" },
};

interface CompanyProfile {
  bizName?: string;
  mainCategory?: string;
  constructionRecords?: { amount: number }[];
  creditScore?: number;
}

export default function QualificationPage() {
  const [annId, setAnnId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QualificationResult | null>(null);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<CompanyProfile | null>(null);

  useEffect(() => {
    void fetch("/api/profile").then(r => r.ok ? r.json() : null).then((data: CompanyProfile | null) => {
      if (data && (data.bizName || data.mainCategory)) setProfile(data);
    }).catch(() => {});
  }, []);

  const inp: React.CSSProperties = { height: 44, border: "1.5px solid #E8ECF2", borderRadius: 10, fontSize: 13, padding: "0 12px", color: "#374151", background: "#fff", outline: "none", width: "100%", boxSizing: "border-box" };
  const card: React.CSSProperties = { background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "24px" };

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true); setResult(null);
    try {
      const res = await fetch("/api/analysis/qualification", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annId: annId.trim() }),
      });
      const data = await res.json() as QualificationResult & { error?: string };
      if (!res.ok) { setError(data.error ?? "오류가 발생했습니다."); return; }
      setResult(data);
    } catch { setError("네트워크 오류"); } finally { setLoading(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: 0 }}>적격심사 계산기</h2>
        </div>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>내 업체 실적 기반으로 적격심사 통과 가능성을 자동으로 계산합니다.</p>
      </div>

      {/* 업체 정보 카드 */}
      <div style={{ ...card, background: "#F8FAFC", border: profile ? "1px solid #BFDBFE" : "1px dashed #CBD5E1" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 28 }}>🏢</span>
            {profile ? (
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1B3A6B" }}>{profile.bizName ?? "내 업체"}</div>
                <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                  {profile.mainCategory && <span>{profile.mainCategory}</span>}
                  {profile.constructionRecords?.length ? <span> · 실적 {profile.constructionRecords.length}건</span> : null}
                  {profile.creditScore ? <span> · 신용 {profile.creditScore}점</span> : null}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>내 업체 정보가 등록되어 있나요?</div>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>업체 실적·업종을 등록하면 더 정확한 판정이 가능합니다.</div>
              </div>
            )}
          </div>
          <Link href="/profile" style={{ background: "#1B3A6B", color: "#fff", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, textDecoration: "none", flexShrink: 0 }}>
            {profile ? "업체 정보 수정" : "업체 정보 등록"}
          </Link>
        </div>
      </div>

      {/* 공고 입력 */}
      <div style={card}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: "0 0 16px" }}>공고 번호로 판정하기</h3>
        <form onSubmit={check}>
          <div style={{ display: "flex", gap: 10 }}>
            <input type="text" value={annId} onChange={e => setAnnId(e.target.value)} placeholder="공고번호 입력 (예: 20240115001)" style={{ ...inp, flex: 1 }} onFocus={e => { (e.target as HTMLInputElement).style.borderColor = "#1B3A6B"; }} onBlur={e => { (e.target as HTMLInputElement).style.borderColor = "#E8ECF2"; }} />
            <button type="submit" disabled={loading} style={{ height: 44, padding: "0 24px", background: loading ? "#94A3B8" : "#1B3A6B", color: "#fff", borderRadius: 10, fontSize: 13, fontWeight: 600, border: "none", cursor: loading ? "not-allowed" : "pointer", flexShrink: 0 }}>
              {loading ? "판정 중..." : "✅ 판정하기"}
            </button>
          </div>
          {error && <div style={{ color: "#DC2626", fontSize: 13, marginTop: 10, background: "#FEF2F2", padding: "8px 12px", borderRadius: 8 }}>{error}</div>}
        </form>
      </div>

      {/* 판정 결과 */}
      {result && (() => {
        const cfg = resultConfig[result.result];
        return (
          <div style={{ ...card, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 36 }}>{cfg.icon}</span>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: cfg.color }}>{cfg.label}</div>
                <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{result.reason}</div>
              </div>
            </div>
            {(result.requiredRecord || result.myRecord) && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {result.requiredRecord && (
                  <div style={{ background: "#fff", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>요구 시공 실적</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#DC2626" }}>{result.requiredRecord}</div>
                  </div>
                )}
                {result.myRecord && (
                  <div style={{ background: "#fff", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>내 업체 실적</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#166534" }}>{result.myRecord}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      <div style={{ background: "#F8FAFC", border: "1px solid #E8ECF2", borderRadius: 10, padding: "12px 16px", fontSize: 12, color: "#6B7280", lineHeight: 1.6 }}>
        ⚠️ 본 판정은 등록된 업체 정보 기반 참고 자료입니다. 실제 입찰 자격은 나라장터 공고 원문을 직접 확인하시기 바랍니다.
      </div>
    </div>
  );
}
