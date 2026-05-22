import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "자주 묻는 질문",
  description:
    "낙비 — 내 손안의 AI 낙찰비서. 나라장터 공고를 0.5초에 분석하는 AI 입찰 분석 서비스의 자주 묻는 질문 모음. " +
    "분석 무료, 낙찰 시에만 수수료. 5,300만 건 학습 데이터, 사정율 예측·복수예가 번호 추천·공고문 자격 자동 분석.",
  keywords: [
    "낙비 FAQ", "낙비 자주 묻는 질문", "낙비 사용법", "낙비 가입",
    "낙찰AI FAQ", "공공입찰 AI 질문",
    "복수예가 번호 정확도", "사정율 예측 정확도", "적격심사 정확도",
    "낙비 데이터", "낙비 환불", "낙비 사업자등록번호",
  ],
  alternates: { canonical: "https://naktal.me/faq" },
  openGraph: {
    title: "낙비 FAQ — 자주 묻는 질문",
    description: "AI 입찰 분석 낙비의 정확도·데이터·요금·가입 관련 자주 묻는 질문 모음.",
    url: "https://naktal.me/faq",
    siteName: "낙비",
    locale: "ko_KR",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "낙비 FAQ" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "낙비 FAQ",
    description: "AI 입찰 분석 낙비의 자주 묻는 질문.",
    images: ["/og.png"],
  },
};

const FAQS = [
  {
    q: "낙비는 어떤 서비스인가요?",
    a: "낙비는 내 손안의 AI 낙찰비서입니다. 나라장터 공고의 사정율·복수예가 번호·참여 자격을 머신러닝이 단 0.5초 만에 분석합니다. 24년치 공공조달 기록(누적 공고 750만 건, 낙찰 결과 520만 건, 개찰 번호 740만 건 등 5,300만 건 이상) 위에서 작동하는 입찰 AI입니다.",
  },
  {
    q: "낙비의 4가지 엔진은 무엇을 하나요?",
    a: "ENGINE 01 사정율 예측 — 공고별 예정가격을 머신러닝으로 정밀 예측. ENGINE 02 복수예가 번호 추천 — 15개 예비가 중 어떤 4개가 뽑힐지 AI 예측. ENGINE 03 공고문 자격 자동 분석 — 공고 본문을 자동으로 읽고 지역제한·면허·실적·업종 요약. ENGINE 04 낙찰 결과 자동 추적 — 투찰 후 결과 자동 수집 및 AI 예측 vs 실제 정확도 검증.",
  },
  {
    q: "어떤 입찰 방식을 지원하나요?",
    a: "복수예가, 적격심사 등 일반 공공입찰 전 영역을 지원합니다. 시설공사 · 용역 · 물품 모두 분석 대상입니다.",
  },
  {
    q: "낙찰이 보장되나요?",
    a: "낙찰을 보장하지 않습니다. AI는 통계적 확률을 높이는 도구이며, 최종 의사결정은 항상 사용자에게 있습니다. AI 분석 결과는 참고용입니다.",
  },
  {
    q: "데이터는 어디서 가져오나요?",
    a: "조달청 나라장터 공식 데이터를 사용합니다. 다른 출처는 사용하지 않습니다. 2002년부터 누적된 24년치 공공조달 데이터를 매일 자동 갱신합니다.",
  },
  {
    q: "분석 결과를 검증할 수 있나요?",
    a: "예. AI 예측 사정율을 그대로 추천하며 임의 보정 없이 G2B(나라장터) 공식 계산기로 직접 검증할 수 있습니다.",
  },
  {
    q: "수수료는 어떻게 되나요?",
    a: "낙찰 시에만 수수료가 발생합니다. 낙찰 금액 1억원 이상은 1.5%, 1억원 미만은 1.7%. 미낙찰 시에는 어떠한 비용도 청구되지 않으며, 분석 자체는 무제한 사용 가능합니다. 월 구독료 없음.",
  },
  {
    q: "왜 결과가 다른 분과 다른가요?",
    a: "수많은 발주처가 각자 다른 패턴을 가집니다. 낙비는 발주처 × 업종 × 시기 패턴을 학습해 공고마다 다른 결과를 냅니다. 따라서 같은 공고라도 사용자 업종·실적 등 조건에 따라 다른 추천을 받을 수 있습니다.",
  },
  {
    q: "지금 분석 가능한 공고는 몇 건인가요?",
    a: "랜딩 페이지에 실시간 표시되는 활성 공고 건수를 분석할 수 있습니다. 분석 가능 공고는 매일 자동 갱신됩니다.",
  },
  {
    q: "번호 추천 정확도는 어느 정도인가요?",
    a: "수만 건의 개찰 데이터 분석 결과, 추천 번호 조합의 평균 적중률은 약 12~15%입니다. 단순 무작위 선택 대비 약 2배 수준입니다. 단, 이는 통계적 참고 자료이며 낙찰을 보장하지 않습니다.",
  },
  {
    q: "적격심사 판정 정확도는요?",
    a: "등록된 업체 실적과 공고 요구사항을 비교한 추정값입니다. 실제 심사는 더 많은 요소(신용평가, 기술능력 등)가 반영되므로 반드시 공고 원문을 확인하세요.",
  },
  {
    q: "복수예가 외 다른 방식도 지원하나요?",
    a: "현재는 복수예가 방식(적격심사 포함)만 지원합니다. 최저가 낙찰제, 수의계약 등 다른 방식은 추후 지원 예정입니다.",
  },
  {
    q: "번호 추천은 어떤 원리인가요?",
    a: "낙찰결과 데이터에서 투찰률(낙찰률)의 소수점 패턴을 분석해 자주 선택되는 '고빈도 번호'를 찾습니다. 그리고 경쟁이 낮은 '저빈도 번호' 조합을 추천합니다. 많은 사람이 피하는 번호가 상대적으로 낙찰 가능성이 높다는 통계적 역설을 활용합니다.",
  },
  {
    q: "데이터는 얼마나 자주 업데이트되나요?",
    a: "나라장터 공고는 하루 3회(오전·낮·저녁), 낙찰결과는 매일 새벽 수집됩니다. 역대 데이터는 2012년부터 수집 완료되어 있습니다.",
  },
  {
    q: "결제 후 환불이 가능한가요?",
    a: "결제 후 7일 이내이고 번호 추천 서비스를 이용하지 않았다면 전액 환불됩니다. 이용 후에는 환불이 불가합니다. 자세한 내용은 이용약관을 확인해주세요.",
  },
  {
    q: "사업자등록번호 없이 가입할 수 있나요?",
    a: "낙찰AI는 사업자 전용 서비스입니다. 사업자등록번호 보유 사업자만 가입 가능합니다.",
  },
  {
    q: "CORE 2 실시간 모니터는 어떻게 동작하나요?",
    a: "개찰 완료 후 KONEPS API에서 실제 참여 업체 수를 수집해 이력을 제공합니다. Pro 플랜 사용자는 유사 공고의 참여자 수 추이를 참고해 전략을 세울 수 있습니다.",
  },
];

export default function FaqPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#F0F2F5" }}>
      <header style={{ background: "#fff", borderBottom: "1px solid #E8ECF2", height: 60, display: "flex", alignItems: "center", padding: "0 32px", justifyContent: "space-between" }}>
        <Link href="/" style={{ fontSize: 18, fontWeight: 800, color: "#1B3A6B", textDecoration: "none" }}>낙비</Link>
        <Link href="/login" style={{ fontSize: 14, color: "#374151", textDecoration: "none" }}>로그인</Link>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>자주 묻는 질문</h1>
        <p style={{ color: "#64748B", fontSize: 14, marginBottom: 40 }}>
          추가 문의는 카카오톡 채널 <a href="http://pf.kakao.com/_SQxmKX/chat" target="_blank" rel="noopener noreferrer" style={{ color: "#1B3A6B", fontWeight: 600, textDecoration: "underline" }}>낙비 (@naktal)</a>로 보내주세요.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {FAQS.map((f) => (
            <details key={f.q} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2" }}>
              <summary style={{ padding: "18px 20px", fontSize: 15, fontWeight: 600, color: "#0F172A", cursor: "pointer", listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {f.q}
                <span style={{ color: "#60A5FA", fontSize: 20, flexShrink: 0, marginLeft: 8 }}>+</span>
              </summary>
              <div style={{ padding: "0 20px 18px", fontSize: 14, color: "#374151", lineHeight: 1.8, borderTop: "1px solid #F1F5F9" }}>{f.a}</div>
            </details>
          ))}
        </div>
      </main>

      <footer style={{ textAlign: "center", padding: "32px 16px", color: "#94A3B8", fontSize: 11.5, lineHeight: 1.7 }}>
        <div>주식회사 호라이즌 · 대표 박상빈 · 사업자등록번호 398-87-03453</div>
        <div>대전광역시 유성구 장대로 106, 2층 제이321호 · 전화 0505-007-9882</div>
        <div style={{ marginTop: 4 }}>
          © 2025 낙비 · <Link href="/terms" style={{ color: "#94A3B8" }}>이용약관</Link> · <Link href="/privacy" style={{ color: "#94A3B8" }}>개인정보처리방침</Link>
        </div>
      </footer>
    </div>
  );
}
