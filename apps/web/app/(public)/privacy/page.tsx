import Link from "next/link";

export const metadata = {
  title: "개인정보처리방침 — 낙비",
};

export default function PrivacyPage() {
  const sections = [
    {
      title: "1. 수집하는 개인정보 항목",
      content: `낙비는 서비스 제공을 위해 아래의 정보를 수집합니다.

[필수 — 회원가입]
• 사업자등록번호
• 상호명
• 대표자명
• 대표자 휴대폰 번호
• 이메일
• 사업장 주소
• 비밀번호 (단방향 암호화 저장)

[필수 — 카카오 본인인증]
※ 카카오 비즈앱 심사 통과 항목만 수집합니다 (CI 연계정보는 수집하지 않습니다).
• 닉네임 (profile_nickname)
• 이름 / 실명 (name)
• 카카오 계정 이메일 (account_email)
• 카카오 계정 전화번호 (phone_number)
• 카카오 회원번호 (id, 카카오 기본 제공)

[선택 — 마케팅 수신 동의]
• 새 공고 추천·이벤트·서비스 안내 발송 여부 (체크박스, 동의 시 동의일시 기록)
• 동의 철회 시 즉시 발송 중단

[선택 — 추가 정보]
• 업체 실적 정보 (적격심사 계산용)
• 알림 키워드·업종·지역 등 알림 조건 설정값

[자동 수집]
• 서비스 이용 기록, 접속 로그 (IP 주소 포함), 분석·의뢰 이력`,
    },
    {
      title: "2. 개인정보 수집 및 이용 목적",
      content: `• 회원가입 및 본인 확인 (사업자번호 + 카카오 명의 인증)
• AI 사정율 예측, 복수예가 번호 추천, 적격심사 판정 등 서비스 제공
• 낙찰 결과 자동 추적 및 수수료 청구·정산
• 공고 알림 발송 (이메일·카카오 알림톡)
• 공지사항 및 서비스 변경 안내
• 부정 가입·도용 방지 (대표자명-카카오 명의 매칭)
• 사업장 주소: 세금계산서·우편물 발송 및 사업자 실재성 확인
• 마케팅 수신 동의 시: 새 공고 추천·이벤트·서비스 안내 발송
• 법적 의무 이행`,
    },
    {
      title: "3. 개인정보 보유 및 이용 기간",
      content: `• 회원 탈퇴 시까지 보유 후 즉시 파기
• 결제 및 거래 기록: 전자상거래법에 따라 5년 보존
• 표시·광고에 관한 기록: 6개월 (전자상거래법)
• 계약 또는 청약철회 등에 관한 기록: 5년 (전자상거래법)
• 소비자 불만 또는 분쟁처리에 관한 기록: 3년 (전자상거래법)
• 접속 로그: 3개월 보존 (통신비밀보호법)
• 본인인증 데이터 (카카오 회원번호, 이름, 휴대폰): 회원 탈퇴 후 5년 보존 (분쟁 대비)`,
    },
    {
      title: "4. 개인정보의 제3자 제공",
      content: `낙비는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다.
단, 다음의 경우는 예외로 합니다.

• 법령에 의거하거나 수사기관의 적법한 절차에 따른 요청이 있는 경우
• 이용자가 명시적으로 동의한 경우`,
    },
    {
      title: "5. 개인정보 처리 위탁",
      content: `낙비는 원활한 서비스 제공을 위해 아래와 같이 개인정보 처리 업무를 위탁합니다.

• Supabase Inc. (미국) — 데이터베이스 및 인증 서비스 운영
• 주식회사 카카오 — 카카오 로그인·본인인증·알림톡 발송
• Resend, Inc. (미국) — 이메일 발송 (시스템 알림)
• PortOne (포트원) — 결제 처리
• Vercel Inc. (미국) — 웹 서비스 호스팅
• 조달청 나라장터 (공공기관) — 사업자등록번호 검증 및 공고 데이터 조회

위탁업체는 위탁된 목적 이외의 용도로 개인정보를 처리하지 않으며,
위탁 관계 종료 시 보유 중인 개인정보를 지체 없이 파기합니다.`,
    },
    {
      title: "6. 정보주체의 권리",
      content: `이용자는 언제든지 아래 권리를 행사할 수 있습니다.

• 개인정보 열람 요청
• 개인정보 정정·삭제 요청
• 처리 정지 요청
• 동의 철회

요청은 카카오톡 채널 '낙비' (@naktal — http://pf.kakao.com/_SQxmKX/chat)로 보내주시면 10일 이내에 처리합니다.`,
    },
    {
      title: "7. 개인정보 보호책임자",
      content: `• 이름: 박상빈 (대표이사)
• 카카오톡 채널: 낙비 (@naktal)
• 채널 URL: http://pf.kakao.com/_SQxmKX
• 1:1 채팅: http://pf.kakao.com/_SQxmKX/chat
• 개인정보 관련 문의는 위 카카오톡 채널로 연락 바랍니다.`,
    },
    {
      title: "8. 개인정보 안전성 확보 조치",
      content: `낙비는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다.

[기술적 조치]
• 비밀번호 단방향 암호화 (bcrypt)
• HTTPS 256bit SSL 전송 구간 암호화
• 데이터베이스 접근 제어 및 RLS (Row Level Security) 적용
• 관리자 페이지 추가 인증 (ADMIN_SECRET_KEY)

[관리적 조치]
• 개인정보 처리 직원 최소화 및 접근 권한 차등 부여
• 모든 관리자 작업은 AdminLog 에 기록
• 정기적 보안 점검 및 취약점 점검`,
    },
    {
      title: "9. 쿠키 및 자동 수집 정보",
      content: `낙비는 서비스 운영을 위해 다음과 같은 자동 수집 정보를 활용합니다.

• 세션 쿠키 (로그인 상태 유지) — 브라우저 종료 시 만료
• Vercel Analytics — 익명 페이지 방문 통계 (개인 식별 정보 없음)
• Vercel Speed Insights — 페이지 성능 측정 (익명)

쿠키 거부는 브라우저 설정에서 가능하며, 거부 시 로그인 등 일부 서비스 이용에 제한이 있을 수 있습니다.`,
    },
    {
      title: "10. 개인정보처리방침 변경",
      content: `이 개인정보처리방침은 2026년 5월 13일부터 적용됩니다. (개정 — 사업장 주소 수집 항목 추가 / 카카오 본인인증 활성화 · CI 미수집 명시)
이전 처리방침(2025년 5월 12일 시행)은 본 처리방침 시행일로부터 효력이 정지됩니다.
변경 시 최소 7일 전에 서비스 공지사항을 통해 안내합니다.
중대한 변경(이용자 권리 또는 의무에 관한 사항)이 있는 경우 최소 30일 전 안내합니다.`,
    },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#F0F2F5" }}>
      <header style={{ background: "#fff", borderBottom: "1px solid #E8ECF2", height: 60, display: "flex", alignItems: "center", padding: "0 32px", justifyContent: "space-between" }}>
        <Link href="/" style={{ fontSize: 18, fontWeight: 800, color: "#1B3A6B", textDecoration: "none" }}>낙비</Link>
        <Link href="/login" style={{ fontSize: 14, color: "#374151", textDecoration: "none" }}>로그인</Link>
      </header>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>개인정보처리방침</h1>
        <p style={{ color: "#64748B", fontSize: 14, marginBottom: 40 }}>시행일: 2026년 5월 13일 (개정)</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {sections.map((s) => (
            <div key={s.title} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "24px 28px" }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1B3A6B", marginBottom: 12 }}>{s.title}</h2>
              <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.9, whiteSpace: "pre-line", margin: 0 }}>{s.content}</p>
            </div>
          ))}
        </div>
      </main>

      <footer style={{ textAlign: "center", padding: "32px 16px", color: "#94A3B8", fontSize: 11.5, lineHeight: 1.7 }}>
        <div>주식회사 호라이즌 · 대표 박상빈 · 사업자등록번호 398-87-03453</div>
        <div>대전광역시 유성구 장대로 106, 2층 제이321호 · 전화 0505-007-9882</div>
        <div style={{ marginTop: 4 }}>
          © 2025 낙비 · <Link href="/terms" style={{ color: "#94A3B8" }}>이용약관</Link>
        </div>
      </footer>
    </div>
  );
}
