interface StatCardProps {
  title: string;
  value: string | number;
  unit?: string;
  sub?: string;
  icon?: string;
  accent?: boolean;
  change?: { value: number; label: string };
  className?: string;
}

export function StatCard({ title, value, unit, sub, icon, accent, change }: StatCardProps) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 14,
      border: "1px solid #F1F5F9",
      borderTop: accent ? "3px solid #1B3A6B" : "1px solid #F1F5F9",
      padding: "18px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 500 }}>{title}</span>
        {icon && (
          <span style={{
            width: 32, height: 32, borderRadius: 8,
            background: "#F8FAFC",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, color: "#64748B",
          }}>
            {icon}
          </span>
        )}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: "#0F172A", lineHeight: 1 }}>
        {value}
        {unit && <span style={{ fontSize: 13, fontWeight: 500, color: "#64748B", marginLeft: 4 }}>{unit}</span>}
      </div>
      {(sub || change) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
          {sub && <div style={{ fontSize: 11, color: "#94A3B8" }}>{sub}</div>}
          {change && (
            <div style={{
              fontSize: 11,
              fontWeight: 600,
              color: change.value >= 0 ? "#059669" : "#DC2626",
            }}>
              {change.value >= 0 ? "+" : ""}{change.value} {change.label}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
