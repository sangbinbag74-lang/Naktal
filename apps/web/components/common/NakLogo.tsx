/* Naktal 로고 "낙" 박스 — 랜딩 페이지 디자인 토큰 */
interface Props {
  size?: number;
  variant?: "dark" | "light";  // dark: navy bg + white char, light: white bg + navy char
  showText?: boolean;
  textColor?: string;
}

export function NakLogo({ size = 28, variant = "dark", showText = true, textColor }: Props) {
  const bg = variant === "dark" ? "#1B3A6B" : "#fff";
  const fg = variant === "dark" ? "#fff" : "#1B3A6B";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: Math.round(size * 0.36) }}>
      <span
        style={{
          width: size,
          height: size,
          borderRadius: Math.max(5, Math.round(size * 0.25)),
          background: bg,
          color: fg,
          display: "grid",
          placeItems: "center",
          fontWeight: 900,
          fontSize: Math.round(size * 0.54),
          letterSpacing: "-0.04em",
          flexShrink: 0,
        }}
      >
        낙
      </span>
      {showText && (
        <span style={{ fontSize: Math.round(size * 0.6), fontWeight: 800, letterSpacing: "-0.025em", color: textColor ?? "currentColor" }}>
          낙비
        </span>
      )}
    </span>
  );
}
