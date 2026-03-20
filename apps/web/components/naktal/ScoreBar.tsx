interface ScoreBarProps {
  label: string;
  score: number;
  maxScore: number;
  color?: string;
}

interface ScoreBarListProps {
  items: ScoreBarProps[];
  title?: string;
}

export function ScoreBarList({ items, title }: ScoreBarListProps) {
  const total = items.reduce((s, i) => s + i.maxScore, 0);
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "18px 20px" }}>
      {title && <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 14 }}>{title}</div>}
      {items.map((item) => (
        <div key={item.label} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: "#374151" }}>{item.label}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: item.color ?? "#1B3A6B" }}>{item.score}점</span>
          </div>
          <div style={{ height: 6, background: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${(item.score / total) * 100}%`,
              background: item.color ?? "#1B3A6B",
              borderRadius: 3,
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}
