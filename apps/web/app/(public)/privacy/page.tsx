import Link from "next/link";

export const metadata = {
  title: "개인정보처리방침 — 낙탈AI",
};

export default function PrivacyPage() {
  const sections = [
    {
      title: "1. 수집하는 개인정보 항목",
      content: `낙탈AI는 서비스 제공을 위해 아래의 정보를 수집합니다.

• 필수: 사업자등록번호, 상호명, 대표자명
• 선택: 알림 이메일, 알림 전화번호
• 자동 수집: 서비스 이용 기록, 접속 로그 (IP 주소 포함)`,
    },
    {
      title: "2. 개인정보 수집 및 이용 목적",
      content: `• 서비스 회원가입 및 본인 확인
• 번호 전략 추천, 적격심사 판정 등 서비스 제공
• 요금제 결제 및 환불 처리
• 공지사항 및 서비스 변경 안내
• 법적 의무 이행`,
    },
    {
      title: "3. 개인정보 보유 및 이용 기간",
      content: `• 회원 탈퇴 시까지 보유 후 즉시 파기
• 결제 및 거래 기록: 전자상거래법에 따라 5년 보존
• 접속 로그: 3개월 보존 (통신비밀보호법)
• 단, 관련 법령에 따른 보존 의무가 있는 경우 해당 기간 동안 보존합니다.`,
    },
    {
      title: "4. 개인정보의 제3자 제공",
      content: `낙탈AI는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다.
단, 법령에 의거하거나 수사기관의 적법한 절차에 따른 요청이 있는 경우는 예외로 합니다.`,
    },
    {
      title: "5. 개인정보 처리 위탁",
      content: `낙탈AI는 원활한 서비스 제공을 위해 아래와 같이 개인정보 처리 업무를 위탁합니다.

• Supabase Inc. — 데이터베이스 및 인증 서비스 운영
• Resend, Inc. — 이메일 발송
• PortOne (포트원) — 결제 처리
• Vercel Inc. — 웹 서비스 호스팅

위탁업체는 위탁된 목적 이외의 용도로 개인정보를 처리하지 않습니다.`,
    },
    {
      title: "6. 정보주체의 권리",
      content: `이용자는 언제든지 아래 권리를 행사할 수 있습니다.

• 개인정보 열람 요청
• 개인정보 정정·삭제 요청
• 처리 정지 요청
• 동의 철회

요청은 support@naktal.ai로 이메일을 보내주시면 10일 이내에 처리합니다.`,
    },
    {
      title: "7. 개인정보 보호책임자",
      content: `• 이름: 홍길동 (대표이사)
• 이메일: privacy@naktal.ai
• 개인정보 관련 문의는 위 이메일로 연락 바랍니다.`,
    },
    {
      title: "8. 개인정보처리방침 변경",
      content: `이 개인정보처리방침은 2025년 1월 1일부터 적용됩니다.
변경 시 최소 7일 전에 서비스 공지사항을 통해 안내합니다.`,
    },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#F0F2F5" }}>
      <header style={{ background: "#fff", borderBottom: "1px solid #E8ECF2", height: 60, display: "flex", alignItems: "center", padding: "0 32px", justifyContent: "space-between" }}>
        <Link href="/" style={{ fontSize: 18, fontWeight: 800, color: "#1B3A6B", textDecoration: "none" }}>NAKTAL.AI</Link>
        <Link href="/login" style={{ fontSize: 14, color: "#374151", textDecoration: "none" }}>로그인</Link>
      </header>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>개인정보처리방침</h1>
        <p style={{ color: "#64748B", fontSize: 14, marginBottom: 40 }}>시행일: 2025년 1월 1일</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {sections.map((s) => (
            <div key={s.title} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "24px 28px" }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1B3A6B", marginBottom: 12 }}>{s.title}</h2>
              <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.9, whiteSpace: "pre-line", margin: 0 }}>{s.content}</p>
            </div>
          ))}
        </div>
      </main>

      <footer style={{ textAlign: "center", padding: "32px", color: "#94A3B8", fontSize: 12 }}>
        © 2025 Naktal.ai · <Link href="/terms" style={{ color: "#94A3B8" }}>이용약관</Link>
      </footer>
    </div>
  );
}
