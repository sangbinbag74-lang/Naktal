import Link from "next/link";

export default function AnnouncementNotFound() {
  return (
    <div style={{ maxWidth: 480, margin: "80px auto", textAlign: "center", padding: "0 24px" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>
        공고를 찾을 수 없습니다
      </div>
      <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.6, marginBottom: 28 }}>
        이 공고는 삭제되었거나 주소가 잘못되었을 수 있습니다.<br />
        공고 목록에서 다시 검색해 주세요.
      </div>
      <Link
        href="/announcements"
        style={{
          display: "inline-block",
          background: "#1B3A6B", color: "#fff",
          padding: "12px 28px", borderRadius: 10,
          fontSize: 14, fontWeight: 700, textDecoration: "none",
        }}
      >
        공고 목록으로 돌아가기
      </Link>
    </div>
  );
}
