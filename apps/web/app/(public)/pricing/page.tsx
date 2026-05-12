import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "요금 안내 — 분석 무료, 낙찰 시에만 수수료",
  description: "낙비 — 내 손안의 AI 낙찰비서. AI 사정율 예측·복수예가 번호 추천·공고문 자격 분석 모두 무료. 낙찰 성공 시에만 수수료(1억 이상 1.5% / 1억 미만 1.7%) 발생.",
  keywords: ["낙비 요금", "낙비 가격", "낙비 수수료", "낙찰AI 요금", "공공입찰 AI 요금", "나라장터 AI 무료", "성공보수형 수수료"],
  alternates: { canonical: "https://naktal.me/pricing" },
  openGraph: {
    title: "낙비 — 요금 안내 (분석 무제한 무료)",
    description: "AI 사정율 예측·복수예가 번호·자격 분석 모두 무료. 낙찰 시에만 수수료.",
    url: "https://naktal.me/pricing",
  },
};

interface Plan {
  name: string;
  price: string;
  unit: string;
  features: string[];
  fee: string | null;
}

const PLANS: Plan[] = [
  {
    name: "분석 서비스",
    price: "0",
    unit: "원 / 무제한",
    features: [
      "AI 사정율 예측 (CORE 1)",
      "복수예가 번호 추천 (CORE 2)",
      "공고문 자격 자동 분석",
      "낙찰하한가 계산",
      "발주처별 사정율 통계",
      "공고 알림 무제한",
    ],
    fee: null,
  },
  {
    name: "낙찰 성공 수수료 — 1억 원 이상",
    price: "1.5",
    unit: "% (실제 낙찰금액 기준)",
    features: [
      "낙찰 성공 시에만 청구",
      "미낙찰 시 수수료 0원",
      "낙찰 공고일로부터 14일 이내 납부",
      "법인계좌 입금만 인정",
    ],
    fee: "낙찰가 100,000,000원 이상",
  },
  {
    name: "낙찰 성공 수수료 — 1억 원 미만",
    price: "1.7",
    unit: "% (실제 낙찰금액 기준)",
    features: [
      "낙찰 성공 시에만 청구",
      "미낙찰 시 수수료 0원",
      "낙찰 공고일로부터 14일 이내 납부",
      "법인계좌 입금만 인정",
    ],
    fee: "낙찰가 100,000,000원 미만",
  },
];

export default function PublicPricingPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#F0F2F5" }}>
      <header style={{ background: "#fff", borderBottom: "1px solid #E8ECF2", height: 60, display: "flex", alignItems: "center", padding: "0 32px", justifyContent: "space-between" }}>
        <Link href="/" style={{ fontSize: 18, fontWeight: 800, color: "#1B3A6B", textDecoration: "none" }}>낙비</Link>
        <Link href="/login" style={{ fontSize: 14, color: "#374151", textDecoration: "none" }}>로그인</Link>
      </header>

      <main style={{ maxWidth: 920, margin: "0 auto", padding: "48px 24px" }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>이용 요금 안내</h1>
        <p style={{ color: "#64748B", fontSize: 15, marginBottom: 40, lineHeight: 1.7 }}>
          분석은 <strong style={{ color: "#1B3A6B" }}>완전 무료</strong> 입니다. 낙찰 성공 시에만 실제 낙찰금액의 일정 비율로 수수료가 청구됩니다.
          <br />
          미낙찰 시 어떠한 비용도 발생하지 않습니다.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 40 }}>
          {PLANS.map((p, i) => (
            <div key={p.name} style={{
              background: "#fff",
              borderRadius: 16,
              border: i === 0 ? "2px solid #1B3A6B" : "1px solid #E8ECF2",
              padding: "28px 24px",
              boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: i === 0 ? "#1B3A6B" : "#64748B", marginBottom: 12, letterSpacing: "-0.01em" }}>
                {p.name}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 16 }}>
                <span style={{ fontSize: 40, fontWeight: 900, color: "#0F172A", letterSpacing: "-0.03em" }}>{p.price}</span>
                <span style={{ fontSize: 14, color: "#64748B", fontWeight: 500 }}>{p.unit}</span>
              </div>
              {p.fee && (
                <div style={{ fontSize: 11, color: "#D97706", background: "#FFFBEB", padding: "4px 10px", borderRadius: 6, fontWeight: 600, display: "inline-block", marginBottom: 14 }}>
                  {p.fee}
                </div>
              )}
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {p.features.map((f) => (
                  <li key={f} style={{ fontSize: 13, color: "#374151", lineHeight: 1.6, paddingLeft: 18, position: "relative" }}>
                    <span style={{ position: "absolute", left: 0, color: "#059669", fontWeight: 700 }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: "20px 24px", marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#92400E", margin: "0 0 12px" }}>수수료 납부 조건</h2>
          <ul style={{ margin: 0, paddingLeft: 20, color: "#78350F", fontSize: 13.5, lineHeight: 1.9 }}>
            <li>수수료는 <strong>낙찰 성공 시에만</strong> 발생합니다. 미낙찰 시 일절 발생하지 않습니다.</li>
            <li>납부 기한: <strong>낙찰 공고일로부터 14일 이내</strong></li>
            <li>납부 계좌: <strong>신한은행 100-038-306439 (예금주: 주식회사 호라이즌)</strong></li>
            <li>법인계좌 입금만 인정됩니다. 개인계좌 등 다른 계좌 입금은 미인정.</li>
            <li>기한 도과 시 연 6% 지연이자 부과 + 서비스 영구 제한 가능</li>
          </ul>
        </div>

        {/* 카카오톡 채널 CTA */}
        <div style={{ marginBottom: 16, background: "#FEE500", borderRadius: 12, padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#191600", marginBottom: 4 }}>문의·상담은 카카오톡으로</div>
            <div style={{ fontSize: 12, color: "#3C1E1E" }}>요금 · 수수료 · 가입 관련 1:1 안내</div>
          </div>
          <a
            href="http://pf.kakao.com/_SQxmKX/chat"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: "#191600", color: "#FEE500",
              padding: "10px 22px", borderRadius: 8,
              fontSize: 14, fontWeight: 700,
              textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            💬 카톡 문의하기
          </a>
        </div>

        <div style={{ background: "#fff", border: "1px solid #E8ECF2", borderRadius: 12, padding: "20px 24px" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: "0 0 12px" }}>관련 문서</h2>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
            <Link href="/terms" style={{ color: "#1B3A6B", textDecoration: "underline" }}>이용약관</Link>
            <Link href="/privacy" style={{ color: "#1B3A6B", textDecoration: "underline" }}>개인정보처리방침</Link>
            <Link href="/refund" style={{ color: "#1B3A6B", textDecoration: "underline" }}>환불·취소 정책</Link>
            <Link href="/faq" style={{ color: "#1B3A6B", textDecoration: "underline" }}>자주 묻는 질문</Link>
          </div>
        </div>
      </main>

      <footer style={{ textAlign: "center", padding: "32px 16px", color: "#94A3B8", fontSize: 11.5, lineHeight: 1.7 }}>
        <div>주식회사 호라이즌 · 대표 박상빈 · 사업자등록번호 398-87-03453</div>
        <div>대전광역시 유성구 장대로 106, 2층 제이321호 · 전화 063-831-9882</div>
        <div style={{ marginTop: 4 }}>© 2025 낙비. All rights reserved.</div>
      </footer>
    </div>
  );
}
