"use client";

interface Column<T> {
  key: keyof T | string;
  label: string;
  render?: (row: T) => React.ReactNode;
}

interface AdminTableProps<T extends Record<string, unknown>> {
  columns: Column<T>[];
  data: T[];
  keyField: keyof T;
}

export function AdminTable<T extends Record<string, unknown>>({
  columns,
  data,
  keyField,
}: AdminTableProps<T>) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E8ECF2", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F8F9FB", borderBottom: "1px solid #E8ECF2" }}>
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  style={{
                    padding: "10px 14px",
                    textAlign: "left",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#64748B",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{ padding: "32px 14px", textAlign: "center", color: "#94A3B8" }}
                >
                  데이터가 없습니다.
                </td>
              </tr>
            )}
            {data.map((row) => (
              <tr
                key={String(row[keyField])}
                style={{ borderBottom: "1px solid #F1F5F9", cursor: "default" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "#F8FAFC"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
              >
                {columns.map((col) => (
                  <td key={String(col.key)} style={{ padding: "10px 14px", color: "#1E293B", verticalAlign: "middle" }}>
                    {col.render
                      ? col.render(row)
                      : String(row[col.key as keyof T] ?? "-")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
