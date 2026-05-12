import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "환불·취소 정책",
  description: "낙비 서비스의 환불·취소·청약철회 정책 안내",
};

const SECTIONS = [
  {
    title: "1. 서비스 무료 이용",
    content:
      "낙비의 AI 투찰 분석 서비스는 분석 자체가 완전 무료입니다. 사용자는 회원가입 후 사정율 예측, 복수예가 번호 추천, 자격 분석 등 모든 분석 기능을 비용 없이 무제한 이용할 수 있습니다.\n" +
      "이에 따라 분석 서비스 이용에 대해 별도로 결제하는 금액이 없으므로, 분석 서비스에 대한 환불 사유가 발생하지 않습니다.",
  },
  {
    title: "2. 수수료 청구 조건",
    content:
      "수수료는 다음 조건이 모두 충족될 때에만 청구됩니다.\n" +
      "① 사용자가 본 서비스를 통해 추천받은 투찰가로 실제 입찰에 참여\n" +
      "② 해당 입찰에서 낙찰 성공\n" +
      "③ 추천가 ±0.5% 이내의 금액으로 투찰 (절사 단위 차이는 동일 금액으로 간주)\n\n" +
      "미낙찰 시 어떠한 수수료도 발생하지 않습니다. 사용자가 분석만 받고 입찰에 참여하지 않은 경우에도 수수료가 발생하지 않습니다.",
  },
  {
    title: "3. 수수료 환불 사유",
    content:
      "이미 납부한 수수료에 대하여 다음과 같은 사유가 인정되는 경우 전액 환불이 가능합니다.\n\n" +
      "① 낙찰자 결정 후 발주처의 사유로 계약이 무효·취소되어 사용자가 실제 계약을 체결하지 못한 경우\n" +
      "② 본 약관 제2조의 수수료 청구 조건이 충족되지 않았음에도 시스템 오류로 수수료가 청구된 경우\n" +
      "③ 기타 사회통념상 환불이 합당하다고 판단되는 경우",
  },
  {
    title: "4. 환불 신청 방법",
    content:
      "환불을 요청하는 사용자는 다음 방법으로 신청할 수 있습니다.\n" +
      "• 이메일: support@naktal.me\n" +
      "• 카카오톡 채널: 낙비 고객센터\n\n" +
      "환불 신청 시 다음 정보를 함께 제공해 주세요.\n" +
      "① 사업자등록번호 · 회사명\n" +
      "② 환불 요청 사유\n" +
      "③ 관련 공고번호 · 낙찰 정보\n" +
      "④ 환불받을 계좌 정보 (법인계좌)",
  },
  {
    title: "5. 환불 처리 기간",
    content:
      "환불 신청 접수 후 영업일 기준 7일 이내에 검토하여 환불 가부 및 사유를 사용자에게 통지합니다.\n" +
      "환불이 승인된 경우, 통지일로부터 영업일 기준 7일 이내에 사용자가 지정한 법인계좌로 환불금을 송금합니다.",
  },
  {
    title: "6. 환불 불가 사유",
    content:
      "다음의 경우 환불이 제한될 수 있습니다.\n" +
      "① 사용자의 단순 변심에 의한 환불 요청\n" +
      "② 낙찰 후 사용자 사정으로 계약을 포기한 경우\n" +
      "③ 본 약관에서 정한 수수료 청구 조건이 모두 충족되어 정당하게 청구된 경우\n" +
      "④ 환불 신청이 청구일로부터 90일을 초과한 경우",
  },
  {
    title: "7. 청약철회",
    content:
      "낙비는 디지털콘텐츠가 아닌 서비스 중개 형태로 운영되며, 결제 금액이 없는 무료 서비스이므로 전자상거래법상 청약철회의 대상이 되지 않습니다.\n" +
      "다만 본 정책 제3조에 명시된 사유가 있는 경우 수수료 환불을 청구할 수 있습니다.",
  },
  {
    title: "8. 분쟁 해결",
    content:
      "환불·취소와 관련하여 분쟁이 발생한 경우, 양 당사자는 신의에 따라 상호 협의하여 해결합니다.\n" +
      "협의로 해결되지 않는 경우 「전자상거래 등에서의 소비자보호에 관한 법률」, 「소비자기본법」 및 한국소비자원의 분쟁조정 절차에 따릅니다.\n" +
      "최종 분쟁 시 관할 법원은 서울중앙지방법원으로 합니다.",
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
        <p style={{ color: "#64748B", fontSize: 14, marginBottom: 40 }}>시행일: 2025년 1월 1일</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {SECTIONS.map((s) => (
            <div key={s.title} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "24px 28px" }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1B3A6B", marginBottom: 12 }}>{s.title}</h2>
              <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.9, whiteSpace: "pre-line", margin: 0 }}>{s.content}</p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 28, padding: "16px 20px", background: "#fff", borderRadius: 10, border: "1px solid #E8ECF2", fontSize: 13, color: "#64748B" }}>
          관련 문서: <Link href="/terms" style={{ color: "#1B3A6B", textDecoration: "underline" }}>이용약관</Link> · <Link href="/privacy" style={{ color: "#1B3A6B", textDecoration: "underline" }}>개인정보처리방침</Link> · <Link href="/pricing" style={{ color: "#1B3A6B", textDecoration: "underline" }}>요금 안내</Link>
        </div>
      </main>

      <footer style={{ textAlign: "center", padding: "32px", color: "#94A3B8", fontSize: 12 }}>
        © 2025 낙비 · 주식회사 호라이즌 · 사업자등록번호 398-87-03453
      </footer>
    </div>
  );
}
