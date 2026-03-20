import Link from "next/link";

export function Footer() {
  return (
    <footer style={{
      background: "#0F1E3C",
      color: "rgba(255,255,255,0.55)",
      padding: "28px 32px",
      fontSize: 12,
      lineHeight: 2,
    }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 24px", marginBottom: 12 }}>
          <Link href="/privacy" style={{ color: "rgba(255,255,255,0.55)", textDecoration: "none" }}>개인정보처리방침</Link>
          <Link href="/terms" style={{ color: "rgba(255,255,255,0.55)", textDecoration: "none" }}>이용약관</Link>
          <a href="mailto:support@naktal.me" style={{ color: "rgba(255,255,255,0.55)", textDecoration: "none" }}>support@naktal.me</a>
        </div>
        <div>상호명: 주식회사 호라이즌 · 대표자: 박상빈 · 사업자등록번호: 398-87-03453</div>
        <div>주소: 대전광역시 유성구 장대로 106, 2층 제이321호 · 호스팅: Vercel Inc.</div>
        <div style={{ color: "rgba(255,255,255,0.35)", marginTop: 8 }}>© 2025 낙탈AI — AI 분석 결과는 통계적 참고 자료이며 낙찰을 보장하지 않습니다.</div>
      </div>
    </footer>
  );
}
