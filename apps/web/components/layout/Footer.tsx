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
        <div>상호명: (주)낙탈 · 대표자: 홍길동 · 사업자등록번호: 000-00-00000</div>
        <div>주소: 서울특별시 강남구 테헤란로 · 호스팅: Vercel Inc.</div>
        <div style={{ color: "rgba(255,255,255,0.35)", marginTop: 8 }}>© 2025 Naktal.ai — AI 분석 결과는 통계적 참고 자료이며 낙찰을 보장하지 않습니다.</div>
      </div>
    </footer>
  );
}
