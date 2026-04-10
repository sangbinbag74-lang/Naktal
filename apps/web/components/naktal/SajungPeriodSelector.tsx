"use client";

const PERIODS = [
  { value: "1y", label: "1년" },
  { value: "2y", label: "2년" },
  { value: "3y", label: "3년" },
  { value: "all", label: "전체" },
] as const;

interface Props {
  value: string;
  onChange: (period: string) => void;
  sampleSize?: number;
  fromCache?: boolean;
}

export function SajungPeriodSelector({ value, onChange, sampleSize, fromCache }: Props) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600 }}>분석 기간</span>
        <div style={{ display: "flex", gap: 3, padding: "3px", background: "#F1F5F9", borderRadius: 8 }}>
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => onChange(p.value)}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: value === p.value ? 700 : 400,
                color: value === p.value ? "#1B3A6B" : "#94A3B8",
                background: value === p.value ? "#fff" : "transparent",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                boxShadow: value === p.value ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                transition: "all 0.12s",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {sampleSize !== undefined && (
          <span style={{ fontSize: 11, color: "#94A3B8" }}>{sampleSize.toLocaleString()}건</span>
        )}
        {fromCache && (
          <span style={{
            fontSize: 10, fontWeight: 600,
            background: "#DCFCE7", color: "#16A34A",
            padding: "2px 6px", borderRadius: 4,
          }}>
            캐시
          </span>
        )}
      </div>
    </div>
  );
}
