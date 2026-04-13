"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// ── 경쟁사 비교 데이터 ──────────────────────────────────────────────────────
const COMPARE = [
  { item: "사정율 예측",     naktal: "✅",      info21c: "❌",    gobid: "일부" },
  { item: "최적 투찰가 역산", naktal: "✅",      info21c: "❌",    gobid: "❌" },
  { item: "낙찰 확률 %",    naktal: "✅",      info21c: "❌",    gobid: "❌" },
  { item: "복수예가 번호 전략", naktal: "✅",   info21c: "통계만", gobid: "❌" },
  { item: "적격심사 계산기", naktal: "✅",      info21c: "배점만", gobid: "일부" },
  { item: "실시간 참여자 수", naktal: "✅ Pro", info21c: "❌",    gobid: "❌" },
  { item: "가격",            naktal: "무료~",   info21c: "월정액", gobid: "낙찰보수" },
];

// ── 차별점 3대 섹션 ───────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: "📊",
    badge: "CORE 1",
    title: "사정율 예측",
    subtitle: "발주처가 어떤 가격대를 선호하는지 압니다",
    desc: "익산시청의 최근 52건 분석 → 사정율 98.9% 집중\n기초금액 4억 × 98.9% = 예정가격 3억 9,560만원 추정",
    color: "#1B3A6B",
  },
  {
    icon: "🎯",
    badge: "CORE 1",
    title: "낙찰 확률 시뮬레이션",
    subtitle: "넣기 전에 확률을 먼저 알 수 있습니다",
    desc: "몬테카를로 시뮬레이션 5,000회 실행\n내 투찰가 기준 낙찰 확률 % 실시간 계산",
    color: "#0369A1",
  },
  {
    icon: "🔢",
    badge: "CORE 2",
    title: "복수예가 번호 전략",
    subtitle: "사정율이 정해지면 번호도 달라집니다",
    desc: "예정가격 구간이 확정되면 이 구간에서\n고빈도 번호를 회피한 최적 조합 3세트 제시",
    color: "#1D4ED8",
  },
];

// ── 무료 플랜 혜택 ────────────────────────────────────────────────────────────
const FREE_BENEFITS = [
  "나라장터 공고 모니터링 무제한",
  "AI 최적 투찰가 분석 월 3회",
  "적격심사 통과 계산 무제한",
  "공고 서류함 저장 무제한",
];

// ── 브라우저 몬테카를로 시뮬레이션 (API 호출 없음) ───────────────────────────
function normalRandom(mean: number, std: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function calcWinProb(
  myBid: number,
  budget: number,
  sajungMean: number,
  sajungStd: number,
  lowerLimitRate: number,
  n = 2000
): number {
  if (!myBid || !budget) return 0;
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const simSajung = normalRandom(sajungMean, sajungStd);
    const simPrice = budget * (simSajung / 100);
    const simLower = simPrice * (lowerLimitRate / 100);
    if (myBid >= simLower && myBid <= simPrice) wins++;
  }
  return Math.round((wins / n) * 100);
}

// ── 인터랙티브 데모 컴포넌트 ─────────────────────────────────────────────────
function HeroDemo() {
  const [budgetM, setBudgetM] = useState(420);    // 단위: 백만원
  const [bidPriceM, setBidPriceM] = useState(415);
  const [prob, setProb] = useState(0);
  const [computing, setComputing] = useState(false);

  const SAJUNG_MEAN = 98.9;
  const SAJUNG_STD  = 0.8;
  const LOWER_RATE  = 87.745;

  const compute = useCallback(() => {
    setComputing(true);
    setTimeout(() => {
      const p = calcWinProb(
        bidPriceM * 1_000_000,
        budgetM * 1_000_000,
        SAJUNG_MEAN,
        SAJUNG_STD,
        LOWER_RATE,
      );
      setProb(p);
      setComputing(false);
    }, 0);
  }, [budgetM, bidPriceM]);

  useEffect(() => { compute(); }, [compute]);

  const optimalBid = Math.round(budgetM * (SAJUNG_MEAN / 100) * 0.9997 * 10) / 10;
  const probColor = prob >= 50 ? "#059669" : prob >= 30 ? "#D97706" : "#DC2626";

  return (
    <div style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 16, padding: "28px 28px 24px", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 18, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        데모 — 실제 엔진과 동일한 계산
      </div>

      {/* 기초금액 슬라이더 */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>기초금액 (기준금액)</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{budgetM.toLocaleString()}백만원</span>
        </div>
        <input
          type="range"
          min={100} max={3000} step={10}
          value={budgetM}
          onChange={(e) => {
            const v = Number(e.target.value);
            setBudgetM(v);
            setBidPriceM(Math.round(v * (SAJUNG_MEAN / 100) * 0.9997 * 10) / 10);
          }}
          style={{ width: "100%", accentColor: "#60A5FA" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
          <span>1억</span><span>30억</span>
        </div>
      </div>

      {/* 투찰금액 입력 */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>투찰금액</span>
          <span style={{ fontSize: 11, color: "#60A5FA" }}>AI 추천: {optimalBid.toLocaleString()}백만원</span>
        </div>
        <input
          type="number"
          value={bidPriceM}
          onChange={(e) => setBidPriceM(Number(e.target.value))}
          style={{
            width: "100%", height: 44, background: "rgba(255,255,255,0.08)",
            border: "1.5px solid rgba(255,255,255,0.2)", borderRadius: 10,
            color: "#fff", fontSize: 16, fontWeight: 700, padding: "0 14px",
            outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* 낙찰 확률 */}
      <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 12, padding: "16px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>예상 낙찰 확률</span>
          <span style={{ fontSize: 28, fontWeight: 900, color: computing ? "rgba(255,255,255,0.3)" : probColor }}>
            {computing ? "…" : `${prob}%`}
          </span>
        </div>
        <div style={{ height: 10, background: "rgba(255,255,255,0.1)", borderRadius: 5, overflow: "hidden" }}>
          <div style={{ width: `${prob}%`, height: "100%", background: probColor, borderRadius: 5, transition: "width 0.4s ease" }} />
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 8 }}>
          몬테카를로 2,000회 시뮬레이션 · 사정율 {SAJUNG_MEAN}% 기준 (데모용 고정값)
        </div>
      </div>
    </div>
  );
}

// ── 메인 랜딩 페이지 ──────────────────────────────────────────────────────────
export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const params = new URLSearchParams(hash.slice(1));
    const type = params.get("type");
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (type === "recovery" && accessToken && refreshToken) {
      const supabase = createClient();
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(() => {
        router.replace("/auth/reset-password");
      });
    }
  }, [router]);

  return (
    <div style={{ minHeight: "100vh", background: "#F0F2F5", fontFamily: "Pretendard, sans-serif" }}>

      {/* ── 헤더 ── */}
      <header style={{
        background: "#fff", borderBottom: "1px solid #E8ECF2", height: 60,
        display: "flex", alignItems: "center", padding: "0 32px",
        justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100,
      }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: "#1B3A6B", letterSpacing: "-0.02em" }}>낙찰AI</span>
        <nav style={{ display: "flex", gap: 20, alignItems: "center" }}>
          <Link href="/pricing" style={{ fontSize: 14, color: "#374151", textDecoration: "none" }}>요금제</Link>
          <Link href="/faq" style={{ fontSize: 14, color: "#374151", textDecoration: "none" }}>FAQ</Link>
          <Link href="/login" style={{ fontSize: 14, color: "#374151", textDecoration: "none" }}>로그인</Link>
          <Link href="/signup" style={{
            fontSize: 14, background: "#1B3A6B", color: "#fff",
            padding: "8px 20px", borderRadius: 8, textDecoration: "none", fontWeight: 600,
          }}>무료 시작</Link>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section style={{ background: "linear-gradient(135deg, #0F1E3C 0%, #1B3A6B 100%)", padding: "72px 24px 80px", color: "#fff" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>

          {/* 왼쪽: 헤드라인 */}
          <div>
            <div style={{
              display: "inline-block", background: "rgba(96,165,250,0.2)", color: "#60A5FA",
              fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 20, marginBottom: 20,
              border: "1px solid rgba(96,165,250,0.35)",
            }}>
              🚀 베타 서비스 운영 중
            </div>

            <h1 style={{ fontSize: 40, fontWeight: 900, lineHeight: 1.25, marginBottom: 18, letterSpacing: "-0.02em" }}>
              이 공고,<br />
              <span style={{ color: "#60A5FA" }}>얼마에 넣어야<br />낙찰될까요?</span>
            </h1>

            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.75)", marginBottom: 8, lineHeight: 1.7 }}>
              수만 건 개찰 데이터가 최적 투찰금액을 알려드립니다.
            </p>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 36, lineHeight: 1.6 }}>
              발주처 패턴 분석 → 사정율 예측 → 낙찰 확률 계산
            </p>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 40 }}>
              <Link href="/signup" style={{
                display: "inline-block", background: "#60A5FA", color: "#fff",
                padding: "15px 32px", borderRadius: 12, fontSize: 16, fontWeight: 700,
                textDecoration: "none",
              }}>
                무료로 시작하기 →
              </Link>
              <Link href="/login" style={{
                display: "inline-block", background: "rgba(255,255,255,0.1)", color: "#fff",
                padding: "15px 24px", borderRadius: 12, fontSize: 14,
                textDecoration: "none", border: "1px solid rgba(255,255,255,0.25)",
              }}>
                로그인
              </Link>
            </div>

            {/* 통계 배지 */}
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              {[
                { label: "누적 분석 공고", value: "42,000+건" },
                { label: "평균 예측 오차", value: "±0.8%p" },
                { label: "무료 플랜", value: "AI 분석 3회/월" },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 오른쪽: 인터랙티브 데모 */}
          <HeroDemo />
        </div>
      </section>

      {/* ── 면책 고지 ── */}
      <div style={{ background: "#FFF7ED", borderTop: "1px solid #FED7AA", padding: "12px 24px", textAlign: "center", fontSize: 12, color: "#92400E" }}>
        ⚠️ AI 분석 결과는 참고용이며 낙찰을 보장하지 않습니다. 실제 투찰 결정은 반드시 전문가와 상의하세요.
      </div>

      {/* ── 차별점 3섹션 ── */}
      <section style={{ maxWidth: 1000, margin: "0 auto", padding: "72px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: "#0F172A", marginBottom: 10 }}>3가지 핵심 분석 엔진</h2>
          <p style={{ fontSize: 15, color: "#64748B" }}>투찰 전 꼭 알아야 할 3가지를 한 번에 제공합니다</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{
              background: "#fff", borderRadius: 16, border: "1px solid #E8ECF2",
              padding: "28px 26px", borderTop: `4px solid ${f.color}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 28 }}>{f.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 700, background: f.color, color: "#fff", padding: "3px 8px", borderRadius: 4 }}>
                  {f.badge}
                </span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A", marginBottom: 6 }}>{f.title}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: f.color, marginBottom: 12 }}>{f.subtitle}</div>
              <div style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.8, whiteSpace: "pre-line" }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 경쟁사 비교 ── */}
      <section style={{ background: "#fff", padding: "72px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: "#0F172A", marginBottom: 10 }}>왜 낙찰AI인가요?</h2>
            <p style={{ fontSize: 14, color: "#64748B" }}>사실에 기반한 비교입니다.</p>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  <th style={{ padding: "12px 16px", textAlign: "left", color: "#374151", fontWeight: 600, borderBottom: "2px solid #E8ECF2" }}>기능</th>
                  <th style={{ padding: "12px 16px", textAlign: "center", color: "#1B3A6B", fontWeight: 800, borderBottom: "2px solid #1B3A6B", background: "#EFF6FF" }}>낙찰AI</th>
                  <th style={{ padding: "12px 16px", textAlign: "center", color: "#374151", fontWeight: 600, borderBottom: "2px solid #E8ECF2" }}>인포21C</th>
                  <th style={{ padding: "12px 16px", textAlign: "center", color: "#374151", fontWeight: 600, borderBottom: "2px solid #E8ECF2" }}>고비드</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row, i) => (
                  <tr key={row.item} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                    <td style={{ padding: "10px 16px", color: "#374151", borderBottom: "1px solid #F1F5F9" }}>{row.item}</td>
                    <td style={{ padding: "10px 16px", textAlign: "center", borderBottom: "1px solid #F1F5F9", background: "#EFF6FF", fontWeight: 700, color: "#1B3A6B" }}>{row.naktal}</td>
                    <td style={{ padding: "10px 16px", textAlign: "center", borderBottom: "1px solid #F1F5F9", color: "#9CA3AF" }}>{row.info21c}</td>
                    <td style={{ padding: "10px 16px", textAlign: "center", borderBottom: "1px solid #F1F5F9", color: "#9CA3AF" }}>{row.gobid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── 무료 플랜 CTA ── */}
      <section style={{ maxWidth: 560, margin: "0 auto", padding: "72px 24px" }}>
        <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #E8ECF2", padding: "44px 40px", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>🎯</div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>
            지금 무료로 시작하세요
          </h2>
          <p style={{ fontSize: 14, color: "#64748B", marginBottom: 28, lineHeight: 1.7 }}>
            사업자등록번호만 있으면 30초 안에 가입 완료.<br />
            신용카드 없이도 바로 분석을 시작할 수 있습니다.
          </p>

          {/* 무료 플랜 혜택 */}
          <div style={{ background: "#F8FAFC", borderRadius: 12, padding: "18px 20px", marginBottom: 28, textAlign: "left" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#9CA3AF", marginBottom: 10, letterSpacing: "0.06em" }}>무료 플랜 혜택</div>
            {FREE_BENEFITS.map((b) => (
              <div key={b} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 13, color: "#374151" }}>
                <span style={{ color: "#059669", fontWeight: 700 }}>✓</span>
                {b}
              </div>
            ))}
          </div>

          <Link href="/signup" style={{
            display: "block", height: 52, lineHeight: "52px", background: "#1B3A6B",
            color: "#fff", borderRadius: 12, fontSize: 16, fontWeight: 700, textDecoration: "none",
            marginBottom: 12,
          }}>
            무료 회원가입 →
          </Link>
          <div style={{ fontSize: 12, color: "#9CA3AF" }}>
            이미 계정이 있으신가요?{" "}
            <Link href="/login" style={{ color: "#1B3A6B", fontWeight: 600, textDecoration: "none" }}>로그인</Link>
          </div>

          <div style={{ marginTop: 20, padding: "12px 0", borderTop: "1px solid #F1F5F9", fontSize: 11, color: "#CBD5E1" }}>
            신청 시 <Link href="/terms" style={{ color: "#94A3B8" }}>이용약관</Link>과{" "}
            <Link href="/privacy" style={{ color: "#94A3B8" }}>개인정보처리방침</Link>에 동의합니다.
          </div>
        </div>
      </section>

      {/* ── 푸터 ── */}
      <footer style={{ background: "#0F1E3C", color: "rgba(255,255,255,0.55)", padding: "32px", textAlign: "center", fontSize: 13, lineHeight: 2 }}>
        <div style={{ marginBottom: 10 }}>
          <Link href="/privacy" style={{ color: "rgba(255,255,255,0.55)", textDecoration: "none", marginRight: 20 }}>개인정보처리방침</Link>
          <Link href="/terms" style={{ color: "rgba(255,255,255,0.55)", textDecoration: "none", marginRight: 20 }}>이용약관</Link>
          <Link href="/faq" style={{ color: "rgba(255,255,255,0.55)", textDecoration: "none", marginRight: 20 }}>FAQ</Link>
          <a href="mailto:support@naktal.me" style={{ color: "rgba(255,255,255,0.55)", textDecoration: "none" }}>support@naktal.me</a>
        </div>
        <div>상호명: 주식회사 호라이즌 | 대표자: 박상빈 | 사업자등록번호: 398-87-03453</div>
        <div>주소: 대전광역시 유성구 장대로 106, 2층 제이321호 | 호스팅: Vercel Inc.</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 8 }}>© 2025 낙찰AI. All rights reserved.</div>
      </footer>
    </div>
  );
}
