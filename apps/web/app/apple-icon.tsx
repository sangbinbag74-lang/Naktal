import { ImageResponse } from "next/og";

export const runtime = "edge";
export const contentType = "image/png";
export const size = { width: 180, height: 180 };

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #1B3A6B 0%, #0F1E3C 100%)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 120,
          fontWeight: 900,
          letterSpacing: "-0.04em",
          borderRadius: 36,
          fontFamily: "sans-serif",
        }}
      >
        낙
      </div>
    ),
    { ...size },
  );
}
