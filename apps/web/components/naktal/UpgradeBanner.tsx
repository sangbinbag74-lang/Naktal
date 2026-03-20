import Link from "next/link";

interface UpgradeBannerProps {
  feature: string;
  requiredPlan?: string;
  className?: string;
}

export function UpgradeBanner({ feature, requiredPlan = "STANDARD" }: UpgradeBannerProps) {
  const planLabel = requiredPlan === "PRO" ? "프로" : "스탠다드";
  return (
    <div style={{
      background: "linear-gradient(135deg, #EEF2FF 0%, #F8FAFF 100%)",
      border: "1px solid #C7D2FE",
      borderRadius: 12,
      padding: "20px 24px",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>🔒</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#1B3A6B", marginBottom: 6 }}>
        {planLabel} 이상 플랜 전용
      </div>
      <div style={{ fontSize: 13, color: "#64748B", marginBottom: 16 }}>
        {feature} 기능은 {planLabel} 플랜부터 이용 가능합니다.
      </div>
      <Link
        href="/pricing"
        style={{
          display: "inline-block",
          background: "#1B3A6B",
          color: "#fff",
          borderRadius: 9,
          padding: "10px 24px",
          fontSize: 13,
          fontWeight: 600,
          textDecoration: "none",
          transition: "background 0.15s ease",
        }}
      >
        업그레이드 →
      </Link>
    </div>
  );
}
