import Link from "next/link";

export const metadata = {
  title: "이용약관 — 낙탈AI",
};

export default function TermsPage() {
  const sections = [
    {
      title: "제1조 (목적)",
      content: "이 이용약관(이하 '약관')은 (주)낙탈(이하 '회사')이 운영하는 낙탈AI(naktal.me) 서비스(이하 '서비스')를 이용함에 있어 회사와 이용자의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.",
    },
    {
      title: "제2조 (서비스 내용)",
      content: `회사는 다음과 같은 서비스를 제공합니다.

• CORE 1: 나라장터 낙찰 데이터 기반 번호 전략 추천
• CORE 2: 실시간 참여자 수 모니터링 (Pro 플랜)
• CORE 3: 업체 실적 기반 적격심사 통과 가능성 산출
• 나라장터 공고 조회 및 알림 서비스

서비스는 나라장터 공공데이터를 기반으로 하며, 공공데이터포털 API 정책에 따라 제공 범위가 변경될 수 있습니다.`,
    },
    {
      title: "제3조 (회원가입)",
      content: `• 사업자등록번호 보유 사업자만 가입 가능합니다.
• 허위 정보로 가입한 경우 서비스 이용이 제한될 수 있습니다.
• 1개 사업자번호에 1개 계정만 허용됩니다.`,
    },
    {
      title: "제4조 (요금제 및 결제)",
      content: `요금제 구분:
• 무료(FREE): 번호 추천 월 3회, 적격심사 기본
• 스탠다드: 월 99,000원 — 번호 추천 월 30회, 적격심사 전체
• 프로: 월 199,000원 — 모든 기능 무제한

결제는 포트원(PortOne)을 통해 처리되며, 카카오페이·네이버페이·토스페이·신용카드를 지원합니다.
구독 요금제는 매월 자동 갱신됩니다.`,
    },
    {
      title: "제5조 (환불 정책)",
      content: `• 결제 후 7일 이내, 번호 추천 서비스를 이용하지 않은 경우: 전액 환불
• 번호 추천 서비스를 1회 이상 이용한 경우: 환불 불가
• 구독 기간 중 중도 해지 시: 잔여 기간 환불 불가

환불 요청: support@naktal.me`,
    },
    {
      title: "제6조 (면책 조항)",
      content: `⚠️ AI 분석 결과는 통계적 참고 자료입니다. 낙찰을 보장하지 않습니다.

• 번호 추천은 과거 통계 데이터 기반이며 미래 낙찰 결과를 보장하지 않습니다.
• 적격심사 판정 결과는 참고용이며 실제 심사 결과와 다를 수 있습니다.
• 나라장터 API 장애로 인한 서비스 중단에 대해 책임지지 않습니다.
• 이용자가 서비스 결과를 기반으로 내린 입찰 결정에 대한 책임은 이용자에게 있습니다.`,
    },
    {
      title: "제7조 (서비스 이용 제한)",
      content: `다음에 해당하는 경우 서비스 이용을 제한할 수 있습니다.

• API 호출 한도 초과 시 자동 제한 (429 응답)
• 타인의 계정을 무단으로 사용한 경우
• 서비스를 이용한 불법 행위
• 허위 사업자번호로 가입한 경우`,
    },
    {
      title: "제8조 (준거법 및 관할)",
      content: "이 약관은 대한민국 법률에 따라 해석되며, 분쟁 발생 시 서울중앙지방법원을 전속 관할 법원으로 합니다.",
    },
    {
      title: "부칙",
      content: "이 약관은 2025년 1월 1일부터 시행됩니다.",
    },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#F0F2F5" }}>
      <header style={{ background: "#fff", borderBottom: "1px solid #E8ECF2", height: 60, display: "flex", alignItems: "center", padding: "0 32px", justifyContent: "space-between" }}>
        <Link href="/" style={{ fontSize: 18, fontWeight: 800, color: "#1B3A6B", textDecoration: "none" }}>NAKTAL.AI</Link>
        <Link href="/login" style={{ fontSize: 14, color: "#374151", textDecoration: "none" }}>로그인</Link>
      </header>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>이용약관</h1>
        <p style={{ color: "#64748B", fontSize: 14, marginBottom: 40 }}>시행일: 2025년 1월 1일</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {sections.map((s) => (
            <div key={s.title} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "24px 28px" }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1B3A6B", marginBottom: 10 }}>{s.title}</h2>
              <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.9, whiteSpace: "pre-line", margin: 0 }}>{s.content}</p>
            </div>
          ))}
        </div>
      </main>

      <footer style={{ textAlign: "center", padding: "32px", color: "#94A3B8", fontSize: 12 }}>
        © 2025 Naktal.ai · <Link href="/privacy" style={{ color: "#94A3B8" }}>개인정보처리방침</Link>
      </footer>
    </div>
  );
}
