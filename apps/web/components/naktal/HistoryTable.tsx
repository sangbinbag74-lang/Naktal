interface HistoryRow {
  title: string;
  budget: string;
  bidRate: number;
  bidderCount: number;
  awardedAt: string;
  isAwarded?: boolean;
}

interface HistoryTableProps {
  rows: HistoryRow[];
  title?: string;
}

function fmt(n: string) {
  const num = parseInt(n, 10);
  if (isNaN(num)) return n;
  if (num >= 100000000) return `${(num / 100000000).toFixed(1)}억`;
  return `${(num / 10000).toFixed(0)}만`;
}

export function HistoryTable({ rows, title }: HistoryTableProps) {
  if (rows.length === 0) {
    return (
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "18px 20px" }}>
        {title && <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 14 }}>{title}</div>}
        <div style={{ textAlign: "center", padding: "24px 0", fontSize: 13, color: "#94A3B8" }}>
          낙찰이력 데이터가 없습니다.
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "18px 20px", overflowX: "auto" }}>
      {title && <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 14 }}>{title}</div>}
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 500 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
            {["공고명", "기초금액", "낙찰률", "참여사수", "낙찰일"].map((h) => (
              <th key={h} style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600, textAlign: "left", padding: "0 8px 10px" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: i < rows.length - 1 ? "1px solid #F8FAFC" : "none" }}>
              <td style={{ fontSize: 12, color: "#0F172A", padding: "10px 8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.title}
              </td>
              <td style={{ fontSize: 12, color: "#64748B", padding: "10px 8px" }}>{fmt(row.budget)}</td>
              <td style={{ fontSize: 13, fontWeight: 700, color: "#1B3A6B", padding: "10px 8px" }}>{row.bidRate.toFixed(3)}%</td>
              <td style={{ fontSize: 12, color: "#64748B", padding: "10px 8px" }}>{row.bidderCount}개사</td>
              <td style={{ fontSize: 11, color: "#94A3B8", padding: "10px 8px" }}>
                {new Date(row.awardedAt).toLocaleDateString("ko-KR")}
                {row.isAwarded && (
                  <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, background: "#F0FDF4", color: "#166534", padding: "1px 5px", borderRadius: 4 }}>낙찰</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
