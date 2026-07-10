import type { Metadata } from "next";
import Link from "next/link";

// 박상빈님 5/20 명시 보호 — CDN 캐시 X (proxy.ts 의 라우트 가드가 작동하도록)
export const dynamic = "force-dynamic";

// 5티어 + 수수료 전면 폐지 (2026-07-09 박상빈님 확정)
export const metadata: Metadata = {
  title: "요금 안내 — 낙찰 수수료 0원, 무료로 시작",
  description:
    "낙비 — 내 손안의 AI 낙찰비서. 낙찰 수수료 0원. 공고 검색·사정율 박스권 무료, " +
    "정밀 투찰가 추천은 무료 월 3건부터. 라이트 9,900원 / 프로 19,900원(런칭가) / 비즈 49,900원 / 마스터 99,000원.",
  keywords: [
    "낙비 요금", "낙비 가격", "낙비 구독", "낙찰 수수료 없음", "수수료 0원",
    "낙찰AI 요금", "공공입찰 AI 구독", "나라장터 AI 무료",
    "입찰 분석 무료", "AI 투찰가 구독", "낙비 환불", "환불 정책",
  ],
  alternates: { canonical: "https://naktal.me/pricing" },
  openGraph: {
    title: "낙비 — 요금 안내 (낙찰 수수료 0원, 무료로 시작)",
    description: "공고 검색·박스권 무료. 정밀 추천 월 3건 무료. 구독 9,900원부터 — 낙찰해도 수수료 없음.",
    url: "https://naktal.me/pricing",
    siteName: "낙비",
    locale: "ko_KR",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "낙비 요금 안내" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "낙비 — 요금 안내",
    description: "낙찰 수수료 0원. 무료로 시작, 구독 9,900원부터.",
    images: ["/og.png"],
  },
};

const TIERS = [
  {
    name: "무료",
    price: "0",
    original: null as string | null,
    badge: null as string | null,
    accent: "#475569",
    features: [
      "공고 검색·상세 무제한",
      "사정율 박스권(범위) 전 공고",
      "공고 AI 분석 월 3건 (정밀 투찰가·번호)",
      "개찰 후 성적표 알림",
      "공고 알림 3개",
    ],
  },
  {
    name: "라이트",
    price: "9,900",
    original: null,
    badge: null,
    accent: "#1D4ED8",
    features: [
      "공고 AI 분석 무제한 — 정밀 투찰가·번호",
      "광고 제거",
      "공고 알림 10개 + 알림톡",
      "사정율 추세·안정성 분석",
      "경쟁사 추적 3개사",
    ],
  },
  {
    name: "프로",
    price: "19,900",
    original: "29,900",
    badge: "⭐ 가장 인기",
    accent: "#1B3A6B",
    features: [
      "AI 원본값 — 보정 0, 운영점 그대로",
      "실시간 참여자 모니터",
      "경쟁사·발주처 심층 분석",
      "우선 알림 무제한 · 엑셀",
      "경쟁사 추적 5개사",
    ],
  },
  {
    name: "비즈",
    price: "49,900",
    original: null,
    badge: null,
    accent: "#6D28D9",
    features: [
      "프로 전체 포함",
      "팀 계정 3개",
      "주간 맞춤 심층 리포트",
      "경쟁사 추적 10개사",
      "우선 1:1 지원",
    ],
  },
  {
    name: "마스터",
    price: "99,000",
    original: null,
    badge: null,
    accent: "#0F172A",
    features: [
      "비즈 전체 포함",
      "팀 계정 5개",
      "월 1회 맞춤 백테스트 리포트",
      "전담 온보딩 · 컨설팅",
      "경쟁사 추적 무제한",
    ],
  },
];

export default function PricingPage() {
  return (
    <div style={{ background: "#F0F2F5", minHeight: "100vh", padding: "64px 20px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <h1 style={{ fontSize: 34, fontWeight: 900, color: "#0F172A", letterSpacing: "-0.03em", margin: "0 0 10px" }}>
            낙찰 수수료 <span style={{ color: "#1B3A6B" }}>0원</span>. 무료로 시작하세요.
          </h1>
          <p style={{ fontSize: 15, color: "#64748B", margin: 0 }}>
            낙찰해도 떼가는 돈이 없습니다 — 구독만으로 모든 기능을 사용합니다. 연간 결제 시 2개월 무료.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
          {TIERS.map((t) => (
            <div key={t.name} style={{
              background: "#fff", borderRadius: 16, padding: "26px 20px", position: "relative",
              border: t.badge ? `2px solid ${t.accent}` : "1px solid #E8ECF2",
              boxShadow: t.badge ? "0 4px 24px rgba(27,58,107,0.10)" : "none",
              display: "flex", flexDirection: "column",
            }}>
              {t.badge && (
                <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: t.accent, color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 12px", borderRadius: 99, whiteSpace: "nowrap" }}>{t.badge}</div>
              )}
              <div style={{ fontSize: 13, fontWeight: 700, color: t.accent, marginBottom: 8 }}>{t.name}</div>
              {t.original && <div style={{ fontSize: 13, color: "#94A3B8", textDecoration: "line-through" }}>정가 {t.original}원</div>}
              <div style={{ fontSize: 25, fontWeight: 800, color: "#0F172A", lineHeight: 1.1 }}>{t.price}<span style={{ fontSize: 14, fontWeight: 600 }}>원</span></div>
              <div style={{ fontSize: 11.5, color: "#94A3B8", margin: "3px 0 16px" }}>
                {t.price === "0" ? "영원히 무료" : "월 / 부가세 포함 · 런칭 가격"}
              </div>
              <div style={{ flex: 1 }}>
                {t.features.map((f) => (
                  <div key={f} style={{ display: "flex", gap: 7, marginBottom: 8 }}>
                    <span style={{ color: "#059669", fontSize: 13, lineHeight: "18px", flexShrink: 0 }}>✓</span>
                    <span style={{ fontSize: 12.5, color: "#374151", lineHeight: "18px" }}>{f}</span>
                  </div>
                ))}
              </div>
              <Link href={t.price === "0" ? "/signup" : "/billing"} style={{
                marginTop: 16, height: 42, borderRadius: 10, fontSize: 13.5, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none",
                background: t.badge ? t.accent : "#fff", color: t.badge ? "#fff" : t.accent,
                border: t.badge ? "none" : `1.5px solid ${t.accent}`,
              }}>
                {t.price === "0" ? "무료로 시작" : "구독하기"}
              </Link>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 36, textAlign: "center", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, color: "#64748B" }}>
            결제: 계좌이체 (세금계산서 발행 가능) · 토스페이 준비 중 · 초기 구독자는 가격 인상 후에도 런칭 가격 유지
          </div>
          <div style={{ fontSize: 12, color: "#94A3B8" }}>
            AI 분석 결과는 참고 자료이며 낙찰을 보장하지 않습니다 · <Link href="/refund" style={{ color: "#64748B" }}>환불 정책</Link> · <Link href="/terms" style={{ color: "#64748B" }}>이용약관</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
