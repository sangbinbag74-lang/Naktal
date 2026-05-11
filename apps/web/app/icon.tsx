import { ImageResponse } from "next/og";

export const runtime = "edge";
export const contentType = "image/png";
export const size = { width: 32, height: 32 };

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#1B3A6B",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
          fontWeight: 900,
          letterSpacing: "-0.04em",
          borderRadius: 6,
          fontFamily: "sans-serif",
        }}
      >
        낙
      </div>
    ),
    { ...size },
  );
}
