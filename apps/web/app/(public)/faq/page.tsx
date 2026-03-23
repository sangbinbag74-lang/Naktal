import Link from "next/link";

export const metadata = { title: "자주 묻는 질문 — 낙찰AI" };

const FAQS = [
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
        <Link href="/" style={{ fontSize: 18, fontWeight: 800, color: "#1B3A6B", textDecoration: "none" }}>NAKTAL.AI</Link>
        <Link href="/login" style={{ fontSize: 14, color: "#374151", textDecoration: "none" }}>로그인</Link>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>자주 묻는 질문</h1>
        <p style={{ color: "#64748B", fontSize: 14, marginBottom: 40 }}>추가 문의는 support@naktal.me로 보내주세요.</p>

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

      <footer style={{ textAlign: "center", padding: "32px", color: "#94A3B8", fontSize: 12 }}>
        © 2025 Naktal.ai · <Link href="/terms" style={{ color: "#94A3B8" }}>이용약관</Link> · <Link href="/privacy" style={{ color: "#94A3B8" }}>개인정보처리방침</Link>
      </footer>
    </div>
  );
}
