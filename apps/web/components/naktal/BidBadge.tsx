interface BidBadgeProps {
  type: "dday" | "category" | "region" | "method" | "special";
  value: string;
  deadline?: string;
  className?: string;
}

function getDDayStyle(deadline: string): { bg: string; color: string } {
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff <= 2) return { bg: "#FEF2F2", color: "#DC2626" };
  if (diff <= 5) return { bg: "#FFF7ED", color: "#C2410C" };
  if (diff <= 10) return { bg: "#EFF6FF", color: "#1E40AF" };
  return { bg: "#F8FAFC", color: "#475569" };
}

const SPECIAL_STYLES: Record<string, { bg: string; color: string }> = {
  "적격심사": { bg: "#EEF2FF", color: "#1B3A6B" },
  "복수예가": { bg: "#EFF6FF", color: "#1E40AF" },
  "재공고": { bg: "#FFFBEB", color: "#92400E" },
  "PQ대상": { bg: "#FAF5FF", color: "#6B21A8" },
  "AI추천": { bg: "#F0FDF4", color: "#166534" },
};

export function BidBadge({ type, value, deadline, className }: BidBadgeProps) {
  let bg = "#F1F5F9";
  let color = "#475569";

  if (type === "dday" && deadline) {
    const s = getDDayStyle(deadline);
    bg = s.bg; color = s.color;
  } else if (type === "category") {
    bg = "#EEF2FF"; color = "#1B3A6B";
  } else if (type === "region") {
    bg = "#F8FAFC"; color = "#64748B";
  } else if (type === "special") {
    const s = SPECIAL_STYLES[value];
    if (s) { bg = s.bg; color = s.color; }
  }

  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        fontSize: 10,
        fontWeight: 600,
        background: bg,
        color,
        padding: "2px 7px",
        borderRadius: 4,
        lineHeight: 1.6,
      }}
    >
      {value}
    </span>
  );
}
