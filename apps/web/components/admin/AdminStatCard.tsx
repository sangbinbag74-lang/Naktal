interface AdminStatCardProps {
  title: string;
  value: string | number;
  sub?: string;
  icon?: string;
}

export function AdminStatCard({ title, value, sub, icon }: AdminStatCardProps) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #E8ECF2",
      borderRadius: 12,
      padding: "16px 18px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <p style={{ fontSize: 12, color: "#64748B", fontWeight: 500 }}>{title}</p>
        {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
      </div>
      <p style={{ fontSize: 22, fontWeight: 700, color: "#0F172A" }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>{sub}</p>}
    </div>
  );
}
