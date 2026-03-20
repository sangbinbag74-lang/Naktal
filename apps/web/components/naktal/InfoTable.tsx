interface InfoRow {
  label: string;
  value: React.ReactNode;
}

interface InfoTableProps {
  rows: InfoRow[];
  title?: string;
  className?: string;
}

export function InfoTable({ rows, title }: InfoTableProps) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "18px 20px" }}>
      {title && (
        <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 14 }}>{title}</div>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: i < rows.length - 1 ? "1px solid #F8FAFC" : "none" }}>
              <td style={{ fontSize: 12, color: "#94A3B8", padding: "8px 0", width: "40%", verticalAlign: "top" }}>{row.label}</td>
              <td style={{ fontSize: 13, color: "#0F172A", fontWeight: 500, padding: "8px 0" }}>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
