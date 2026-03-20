"use client";
import { useState } from "react";
import Link from "next/link";

const FEATURES = [
  {
    icon: "🎯",
    title: "CORE 1 — 번호 역이용 AI",
    desc: "수만 건 개찰 데이터에서 고빈도 번호를 찾아 자동 회피하고, 경쟁이 낮은 저빈도 조합 3세트를 추천합니다.",
  },
  {
    icon: "📡",
    title: "CORE 2 — 실시간 참여자 수 반영",
    desc: "마감 전 참여자 수 변화에 따라 번호 전략을 실시간으로 재계산합니다. 경쟁 상황을 즉시 파악하세요.",
  },
  {
    icon: "✅",
    title: "CORE 3 — 적격심사 통과 계산기",
    desc: "업체 시공 실적을 등록하면 입찰 공고별 적격심사 통과 가능성을 자동으로 산출합니다.",
  },
];

const COMPARE = [
  { item: "번호 추천 AI", naktal: "✅", info21c: "❌", gobid: "❌" },
  { item: "실시간 참여자 수", naktal: "✅", info21c: "❌", gobid: "❌" },
  { item: "적격심사 계산기", naktal: "✅", info21c: "❌", gobid: "일부" },
  { item: "나라장터 공고 조회", naktal: "✅", info21c: "✅", gobid: "✅" },
  { item: "사업자번호 기반 로그인", naktal: "✅", info21c: "❌", gobid: "❌" },
];

export default function LandingPage() {
  const [form, setForm] = useState({ bizNo: "", bizName: "", email: "", category: "" });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bizNo || !form.bizName || !form.email) { setError("필수 항목을 모두 입력해주세요."); return; }
    setSubmitting(true); setError("");
    const res = await fetch("/api/beta/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (res.ok) { setSubmitted(true); } else { setError("신청 중 오류가 발생했습니다. 다시 시도해주세요."); }
    setSubmitting(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F0F2F5", fontFamily: "Pretendard, sans-serif" }}>
      {/* 헤더 */}
      <header style={{ background: "#fff", borderBottom: "1px solid #E8ECF2", height: 60, display: "flex", alignItems: "center", padding: "0 32px", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: "#1B3A6B" }}>NAKTAL.AI</span>
        <nav style={{ display: "flex", gap: 20, alignItems: "center" }}>
          <Link href="/pricing" style={{ fontSize: 14, color: "#374151", textDecoration: "none" }}>요금제</Link>
          <Link href="/login" style={{ fontSize: 14, background: "#1B3A6B", color: "#fff", padding: "8px 20px", borderRadius: 8, textDecoration: "none", fontWeight: 600 }}>로그인</Link>
        </nav>
      </header>

      {/* 히어로 */}
      <section style={{ background: "linear-gradient(135deg, #0F1E3C 0%, #1B3A6B 100%)", padding: "80px 24px", textAlign: "center", color: "#fff" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={{ display: "inline-block", background: "rgba(96,165,250,0.2)", color: "#60A5FA", fontSize: 12, fontWeight: 700, padding: "6px 14px", borderRadius: 20, marginBottom: 20, border: "1px solid rgba(96,165,250,0.4)" }}>
            🎉 베타 오픈 — 선착순 30개사 스탠다드 50% 할인
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 900, lineHeight: 1.3, marginBottom: 16 }}>
            이 공고,<br />
            <span style={{ color: "#60A5FA" }}>몇 번 넣어야 할까요?</span>
          </h1>
          <p style={{ fontSize: 18, color: "rgba(255,255,255,0.75)", marginBottom: 12, lineHeight: 1.7 }}>
            수만 건 개찰 데이터가 답합니다.
          </p>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 36 }}>
            인포21C는 정보를 준다. 낙탈은 번호를 준다.
          </p>
          <a href="#beta" style={{ display: "inline-block", background: "#60A5FA", color: "#fff", padding: "16px 36px", borderRadius: 12, fontSize: 16, fontWeight: 700, textDecoration: "none", marginRight: 12 }}>
            베타 신청하기 →
          </a>
          <Link href="/login" style={{ display: "inline-block", background: "rgba(255,255,255,0.1)", color: "#fff", padding: "16px 28px", borderRadius: 12, fontSize: 14, textDecoration: "none", border: "1px solid rgba(255,255,255,0.3)" }}>
            로그인
          </Link>
        </div>
      </section>

      {/* 기능 3대 엔진 */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "64px 24px" }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", textAlign: "center", marginBottom: 40 }}>3대 핵심 엔진</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "28px 24px" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>{f.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1B3A6B", marginBottom: 8 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.7 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 경쟁사 비교 */}
      <section style={{ background: "#fff", padding: "64px 24px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", textAlign: "center", marginBottom: 8 }}>왜 낙탈AI인가요?</h2>
          <p style={{ textAlign: "center", color: "#64748B", fontSize: 14, marginBottom: 36 }}>사실에 기반한 비교입니다.</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  <th style={{ padding: "12px 16px", textAlign: "left", color: "#374151", fontWeight: 600, borderBottom: "2px solid #E8ECF2" }}>기능</th>
                  <th style={{ padding: "12px 16px", textAlign: "center", color: "#1B3A6B", fontWeight: 700, borderBottom: "2px solid #1B3A6B", background: "#EFF6FF" }}>낙탈AI</th>
                  <th style={{ padding: "12px 16px", textAlign: "center", color: "#374151", fontWeight: 600, borderBottom: "2px solid #E8ECF2" }}>인포21C</th>
                  <th style={{ padding: "12px 16px", textAlign: "center", color: "#374151", fontWeight: 600, borderBottom: "2px solid #E8ECF2" }}>고비드</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row, i) => (
                  <tr key={row.item} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                    <td style={{ padding: "10px 16px", color: "#374151", borderBottom: "1px solid #F1F5F9" }}>{row.item}</td>
                    <td style={{ padding: "10px 16px", textAlign: "center", borderBottom: "1px solid #F1F5F9", background: "#EFF6FF", fontWeight: 700 }}>{row.naktal}</td>
                    <td style={{ padding: "10px 16px", textAlign: "center", borderBottom: "1px solid #F1F5F9" }}>{row.info21c}</td>
                    <td style={{ padding: "10px 16px", textAlign: "center", borderBottom: "1px solid #F1F5F9" }}>{row.gobid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 베타 신청 폼 */}
      <section id="beta" style={{ maxWidth: 560, margin: "0 auto", padding: "64px 24px" }}>
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E8ECF2", padding: "40px 36px" }}>
          {submitted ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1B3A6B", marginBottom: 8 }}>베타 신청 완료!</h2>
              <p style={{ color: "#64748B", fontSize: 14, lineHeight: 1.7 }}>신청해 주셔서 감사합니다.<br />검토 후 이메일로 안내드리겠습니다.<br /><span style={{ color: "#1B3A6B", fontWeight: 600 }}>승인 시 스탠다드 50% 할인</span>이 적용됩니다.</p>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>베타 신청</h2>
              <p style={{ color: "#64748B", fontSize: 13, marginBottom: 28 }}>선착순 30개사 · 스탠다드 50% 할인 (월 49,500원)</p>

              {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{error}</div>}

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  { key: "bizNo", label: "사업자등록번호 *", placeholder: "000-00-00000", type: "text" },
                  { key: "bizName", label: "상호명 *", placeholder: "(주)홍길동건설", type: "text" },
                  { key: "email", label: "이메일 *", placeholder: "contact@example.com", type: "email" },
                  { key: "category", label: "주요 업종", placeholder: "예: 시설공사업, 토목공사업", type: "text" },
                ].map(({ key, label, placeholder, type }) => (
                  <div key={key}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>{label}</label>
                    <input
                      type={type}
                      value={form[key as keyof typeof form]}
                      onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                      placeholder={placeholder}
                      style={{ width: "100%", height: 48, padding: "0 14px", border: "1.5px solid #E8ECF2", borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                ))}

                <button
                  type="submit"
                  disabled={submitting}
                  style={{ height: 52, background: submitting ? "#94A3B8" : "#1B3A6B", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: submitting ? "wait" : "pointer", marginTop: 8 }}
                >
                  {submitting ? "신청 중..." : "베타 신청하기 →"}
                </button>

                <p style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", margin: 0 }}>
                  신청 시 <Link href="/terms" style={{ color: "#6B7280" }}>이용약관</Link>과 <Link href="/privacy" style={{ color: "#6B7280" }}>개인정보처리방침</Link>에 동의하는 것으로 간주합니다.
                </p>
              </form>
            </>
          )}
        </div>
      </section>

      {/* 푸터 */}
      <footer style={{ background: "#0F1E3C", color: "rgba(255,255,255,0.6)", padding: "32px", textAlign: "center", fontSize: 13, lineHeight: 2 }}>
        <div style={{ marginBottom: 12 }}>
          <Link href="/privacy" style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none", marginRight: 20 }}>개인정보처리방침</Link>
          <Link href="/terms" style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none", marginRight: 20 }}>이용약관</Link>
          <a href="mailto:support@naktal.me" style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>support@naktal.me</a>
        </div>
        <div>상호명: (주)낙탈 | 대표자: 홍길동 | 사업자등록번호: 000-00-00000</div>
        <div>주소: 서울특별시 강남구 테헤란로 | 호스팅: Vercel Inc.</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 8 }}>© 2025 Naktal.ai. All rights reserved.</div>
      </footer>
    </div>
  );
}
