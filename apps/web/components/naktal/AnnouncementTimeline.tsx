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
  const ms = d.getTime() - Date.now();
  if (ms < 0) return { label: "마감", color: "#94A3B8" };
  const totalH = Math.floor(ms / 3600000);
  // 24시간 미만 — 시·분 단위
  if (totalH < 24) {
    if (totalH < 1) {
      const mins = Math.max(0, Math.floor(ms / 60000));
      return { label: `${mins}분 남음`, color: "#DC2626" };
    }
    const mins = Math.floor((ms - totalH * 3600000) / 60000);
    return { label: mins > 0 ? `${totalH}시간 ${mins}분 남음` : `${totalH}시간 남음`, color: "#DC2626" };
  }
  const days = Math.floor(totalH / 24);
  if (days <= 2) return { label: `${days}일 남음`, color: "#DC2626" };
  if (days <= 5) return { label: `${days}일 남음`, color: "#C2410C" };
  return { label: `${days}일 남음`, color: "#1E40AF" };
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

  // dot 균등 배치: 4단계 → 12.5/37.5/62.5/87.5%
  const dotLeft = (i: number) => `${(i + 0.5) * (100 / stages.length)}%`;

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "16px 20px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ position: "relative", height: 8, marginBottom: 12, marginTop: 4 }}>
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
                left: dotLeft(i),
                transform: "translate(-50%, -50%)",
                width: isCurrent ? 12 : 9, height: isCurrent ? 12 : 9,
                borderRadius: "50%",
                background: isCurrent ? "#1B3A6B" : isPast ? "#1B3A6B" : "#fff",
                border: `2px solid ${isCurrent || isPast ? "#1B3A6B" : "#CBD5E1"}`,
                transition: "all 0.2s",
              }} />
            );
          })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
          {stages.map((s, i) => {
            const dd = dDayLabel(s.date);
            const isCurrent = i === currentIdx;
            return (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{
                  fontSize: 11, fontWeight: isCurrent ? 700 : 500,
                  color: isCurrent ? "#1B3A6B" : "#64748B", marginBottom: 2,
                }}>
                  {s.label}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
                  {s.date ? `${fmtDate(s.date)} ${fmtTime(s.date)}` : "-"}
                </div>
                <div style={{ fontSize: 10, fontWeight: 600, color: dd.color, marginTop: 1 }}>
                  {dd.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
