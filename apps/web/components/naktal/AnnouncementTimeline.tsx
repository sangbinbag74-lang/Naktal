interface Props {
  rcptBgnDt?: string | null;        // 입찰개시일
  bidPrtcptQlfctRgstDdln?: string | null; // 참가등록마감
  bidClseDt?: string | null;        // 투찰마감
  opengDt?: string | null;          // 개찰일시
}

function parseG2BDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  // "2026-05-12 10:00:00" 또는 ISO 형식
  const d = new Date(s.replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(d: Date | null): string {
  if (!d) return "-";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}
function fmtTime(d: Date | null): string {
  if (!d) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function dDayLabel(d: Date | null): { label: string; color: string } {
  if (!d) return { label: "-", color: "#94A3B8" };
  const diff = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (diff < 0) return { label: "마감", color: "#94A3B8" };
  if (diff === 0) return { label: "오늘", color: "#DC2626" };
  if (diff <= 2) return { label: `${diff}일 남음`, color: "#DC2626" };
  if (diff <= 5) return { label: `${diff}일 남음`, color: "#C2410C" };
  return { label: `${diff}일 남음`, color: "#1E40AF" };
}

export function AnnouncementTimeline({
  rcptBgnDt, bidPrtcptQlfctRgstDdln, bidClseDt, opengDt,
}: Props) {
  const stages = [
    { label: "입찰개시", date: parseG2BDate(rcptBgnDt) },
    { label: "참가마감", date: parseG2BDate(bidPrtcptQlfctRgstDdln) },
    { label: "투찰마감", date: parseG2BDate(bidClseDt) },
    { label: "개찰일시", date: parseG2BDate(opengDt) },
  ];

  // 현재 단계 (가장 가까운 미래 단계)
  const now = Date.now();
  let currentIdx = stages.findIndex((s) => s.date && s.date.getTime() > now);
  if (currentIdx === -1) currentIdx = stages.length - 1; // 모두 지남

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "20px 24px" }}>
      <div style={{ position: "relative", height: 8, marginBottom: 16, marginTop: 8 }}>
        {/* 베이스 라인 */}
        <div style={{
          position: "absolute", top: "50%", left: "12.5%", right: "12.5%",
          height: 2, background: "#E2E8F0", transform: "translateY(-50%)",
        }} />
        {/* 진행 라인 (current 까지) */}
        <div style={{
          position: "absolute", top: "50%", left: "12.5%",
          width: currentIdx === 0 ? "0%" : `${(currentIdx / (stages.length - 1)) * 75}%`,
          height: 2, background: "#1B3A6B", transform: "translateY(-50%)", transition: "width 0.3s",
        }} />
        {/* 단계 dot */}
        {stages.map((s, i) => {
          const isPast = s.date != null && s.date.getTime() <= now;
          const isCurrent = i === currentIdx;
          return (
            <div key={s.label} style={{
              position: "absolute", top: "50%",
              left: `${12.5 + (i / (stages.length - 1)) * 75}%`,
              transform: "translate(-50%, -50%)",
              width: isCurrent ? 14 : 10, height: isCurrent ? 14 : 10,
              borderRadius: "50%",
              background: isCurrent ? "#1B3A6B" : isPast ? "#1B3A6B" : "#fff",
              border: `2px solid ${isCurrent || isPast ? "#1B3A6B" : "#CBD5E1"}`,
              transition: "all 0.2s",
            }} />
          );
        })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {stages.map((s, i) => {
          const dd = dDayLabel(s.date);
          const isCurrent = i === currentIdx;
          return (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{
                fontSize: 12, fontWeight: isCurrent ? 700 : 500,
                color: isCurrent ? "#1B3A6B" : "#64748B", marginBottom: 4,
              }}>
                {s.label}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>
                {s.date ? `${fmtDate(s.date)} ${fmtTime(s.date)}` : "-"}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: dd.color, marginTop: 2 }}>
                {dd.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
