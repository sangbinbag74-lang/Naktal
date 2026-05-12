import { ImageResponse } from "next/og";

export const runtime = "edge";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "linear-gradient(180deg, #0F1E3C 0%, #1B3A6B 100%)",
          fontFamily: "sans-serif",
          color: "#fff",
        }}
      >
        {/* 로고 */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              background: "#fff",
              color: "#1B3A6B",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              fontSize: 32,
              letterSpacing: "-0.04em",
            }}
          >
            낙
          </div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.02em" }}>낙비</div>
            <div style={{ fontSize: 15, color: "#93C5FD", marginTop: 4, fontWeight: 500 }}>내 손안의 AI 낙찰비서</div>
          </div>
        </div>

        {/* 메인 카피 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "#93C5FD",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            Procurement Intelligence
          </div>
          <div
            style={{
              fontSize: 84,
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: "-0.035em",
            }}
          >
            <div>직감의 시대는 끝났다.</div>
            <div>
              입찰은 이제 <span style={{ color: "#60A5FA" }}>데이터다.</span>
            </div>
          </div>
        </div>

        {/* 하단 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 24, fontWeight: 500, color: "rgba(255,255,255,0.7)" }}>
            나라장터 공고를 0.5초에 분석 · 사정율 · 복수예가 번호 · 자격
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#60A5FA", letterSpacing: "0.02em" }}>
            naktal.me
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
