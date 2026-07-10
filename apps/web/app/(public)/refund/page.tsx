import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "환불·취소·청약철회 정책",
  description: "낙비 구독 서비스의 환불·취소·청약철회 정책. 이용 전 전액 환불, 이용 중 일할 계산 환불. 낙찰 수수료 0원.",
  keywords: ["낙비 환불", "낙비 취소", "낙비 청약철회", "낙비 구독 환불", "낙찰AI 환불", "공공입찰 AI 환불"],
  alternates: { canonical: "https://naktal.me/refund" },
};

const SECTIONS = [
  {
    title: "1. 요금 체계 (구독형 · 낙찰 수수료 없음)",
    content:
      "낙비는 구독형 서비스입니다. 낙찰 여부와 무관하게 어떠한 성공보수·수수료도 청구하지 않습니다.\n" +
      "무료 플랜은 결제 금액이 없으므로 환불 대상이 아니며, 본 정책은 유료 구독(라이트·프로·비즈·마스터, 월간/연간)에 적용됩니다.\n" +
      "결제는 계좌이체(무통장 입금)로 하며, 입금 확인 시점부터 이용 기간이 개시됩니다.",
  },
  {
    title: "2. 청약철회 (전액 환불)",
    content:
      "다음의 경우 결제 금액 전액을 환불합니다.\n\n" +
      "① 입금 후 이용 기간 개시(플랜 활성화) 전 — 언제든 전액 환불\n" +
      "② 플랜 활성화 후 7일 이내로서, 유료 전용 기능(정밀 추천 무제한·AI 원본값·실시간 모니터·맞춤 리포트 등)을 사용하지 않은 경우 — 전액 환불\n" +
      "③ 회사의 귀책 사유(시스템 오류·중복 입금 확인 등)로 잘못 결제 처리된 경우 — 전액 환불",
  },
  {
    title: "3. 이용 중 환불 (일할 계산)",
    content:
      "이용 기간 개시 후 중도 해지하는 경우, 다음 기준으로 환불합니다.\n\n" +
      "① 월간 구독: 결제 금액 × (남은 일수 ÷ 결제 기간 일수) 를 환불\n" +
      "② 연간 구독: 할인 혜택(2개월 무료)이 적용된 결제이므로, 사용한 기간을 '할인 전 월간 요금'으로 계산해 차감한 잔액을 환불\n" +
      "③ 회사 시스템 장애로 서비스를 정상 이용하지 못한 기간이 있는 경우 — 해당 기간만큼 이용 기간을 연장하거나 일할 환불 중 이용자가 선택",
  },
  {
    title: "4. 환불 신청 방법",
    content:
      "환불을 요청하는 사용자는 카카오톡 채널을 통해 신청할 수 있습니다.\n\n" +
      "• 카카오톡 채널: 낙비 (@naktal)\n" +
      "• 채널 URL: http://pf.kakao.com/_SQxmKX\n" +
      "• 1:1 채팅: http://pf.kakao.com/_SQxmKX/chat\n\n" +
      "환불 신청 시 다음 정보를 함께 제공해 주세요.\n" +
      "① 사업자등록번호 · 회사명\n" +
      "② 구독 플랜 및 결제(입금) 일자\n" +
      "③ 환불 요청 사유\n" +
      "④ 환불받을 계좌 정보 (입금 시 사용한 계좌 권장)",
  },
  {
    title: "5. 환불 처리 기간",
    content:
      "환불 신청 접수 후 영업일 기준 3일 이내에 검토하여 환불 가부 및 금액을 사용자에게 통지합니다.\n" +
      "환불이 승인된 경우, 통지일로부터 영업일 기준 7일 이내에 사용자가 지정한 계좌로 환불금을 송금합니다.\n" +
      "세금계산서가 발행된 경우 수정세금계산서 발행과 함께 처리됩니다.",
  },
  {
    title: "6. 환불 제한 사유",
    content:
      "다음의 경우 환불이 제한될 수 있습니다.\n" +
      "① 이용 기간이 모두 경과한 후의 환불 요청\n" +
      "② 약관 위반(계정 공유·자동화 도구 사용·데이터 무단 복제 등)으로 이용이 제한된 경우\n" +
      "③ 무료 플랜 등 결제 금액이 없는 이용에 대한 환불 요청",
  },
  {
    title: "7. 종전 수수료 제도 (폐지·전면 면제)",
    content:
      "2026년 7월 9일부로 낙찰 성공 수수료(1.5%/1.7%) 제도는 폐지되었습니다.\n" +
      "폐지 이전에 체결된 수수료 약정(투찰 의뢰 계약)에 따른 수수료는 전부 면제되며, 이후 어떠한 수수료도 청구되지 않습니다.\n" +
      "이미 납부된 수수료가 있는 경우 전액 환불 대상입니다. (현재까지 청구·납부된 수수료는 없습니다.)",
  },
  {
    title: "8. 분쟁 해결",
    content:
      "환불·취소와 관련하여 분쟁이 발생한 경우, 양 당사자는 신의에 따라 상호 협의하여 해결합니다.\n" +
      "협의로 해결되지 않는 경우 「전자상거래 등에서의 소비자보호에 관한 법률」, 「소비자기본법」 및 한국소비자원의 분쟁조정 절차에 따릅니다.\n" +
      "최종 분쟁 시 관할 법원은 회사 본점 소재지를 관할하는 법원으로 합니다.",
  },
];

export default function RefundPolicyPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#F0F2F5" }}>
      <header style={{ background: "#fff", borderBottom: "1px solid #E8ECF2", height: 60, display: "flex", alignItems: "center", padding: "0 32px", justifyContent: "space-between" }}>
        <Link href="/" style={{ fontSize: 18, fontWeight: 800, color: "#1B3A6B", textDecoration: "none" }}>낙비</Link>
        <Link href="/login" style={{ fontSize: 14, color: "#374151", textDecoration: "none" }}>로그인</Link>
      </header>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>환불·취소·청약철회 정책</h1>
        <p style={{ color: "#64748B", fontSize: 14, marginBottom: 40 }}>시행일: 2026년 7월 9일 (개정 — 구독 요금제 도입·수수료 폐지)</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {SECTIONS.map((s) => (
            <div key={s.title} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "24px 28px" }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1B3A6B", marginBottom: 12 }}>{s.title}</h2>
              <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.9, whiteSpace: "pre-line", margin: 0 }}>{s.content}</p>
            </div>
          ))}
        </div>

        {/* 카카오톡 채널 CTA */}
        <div style={{ marginTop: 28, background: "#FEE500", borderRadius: 12, padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#191600", marginBottom: 4 }}>환불 신청은 카카오톡 채널로</div>
            <div style={{ fontSize: 12, color: "#3C1E1E" }}>1:1 채팅으로 빠르게 처리해드립니다</div>
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

        <div style={{ marginTop: 16, padding: "16px 20px", background: "#fff", borderRadius: 10, border: "1px solid #E8ECF2", fontSize: 13, color: "#64748B" }}>
          관련 문서: <Link href="/terms" style={{ color: "#1B3A6B", textDecoration: "underline" }}>이용약관</Link> · <Link href="/privacy" style={{ color: "#1B3A6B", textDecoration: "underline" }}>개인정보처리방침</Link> · <Link href="/pricing" style={{ color: "#1B3A6B", textDecoration: "underline" }}>요금 안내</Link>
        </div>
      </main>

      <footer style={{ textAlign: "center", padding: "32px 16px", color: "#94A3B8", fontSize: 11.5, lineHeight: 1.7 }}>
        <div>주식회사 호라이즌 · 대표 박상빈 · 사업자등록번호 398-87-03453</div>
        <div>대전광역시 유성구 장대로 106, 2층 제이321호 · 전화 0505-007-9882</div>
        <div style={{ marginTop: 4 }}>© 2025 낙비. All rights reserved.</div>
      </footer>
    </div>
  );
}
