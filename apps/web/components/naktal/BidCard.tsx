import Link from "next/link";
import { BidBadge } from "./BidBadge";

interface BidCardProps {
  id: string;
  title: string;
  orgName: string;
  konepsId: string;
  budget: string;
  deadline: string;
  category?: string;
  region?: string;
}

function fmt(n: string): string {
  const num = parseInt(n, 10);
  if (isNaN(num)) return n;
  if (num >= 100000000) return `${(num / 100000000).toFixed(1)}억원`;
  if (num >= 10000) return `${(num / 10000).toFixed(0)}만원`;
  return new Intl.NumberFormat("ko-KR").format(num) + "원";
}

function fmtDeadline(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function getDDayLabel(deadline: string): string {
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return "마감";
  return `D-${diff}`;
}

export function BidCard({ id, title, orgName, konepsId, budget, deadline, category, region }: BidCardProps) {
  return (
    <Link href={`/announcements/${id}`} style={{ textDecoration: "none" }}>
      <div style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #E8ECF2",
        overflow: "hidden",
        transition: "box-shadow 0.15s ease",
        cursor: "pointer",
      }}>
        {/* top */}
        <div style={{ padding: "14px 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
              {category && <BidBadge type="category" value={category} />}
              {region && <BidBadge type="region" value={region} />}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {title}
            </div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 3 }}>{orgName} · {konepsId}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 2 }}>기초금액</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1B3A6B" }}>{fmt(budget)}</div>
            <BidBadge type="dday" value={`${getDDayLabel(deadline)} · ${fmtDeadline(deadline)}`} deadline={deadline} />
          </div>
        </div>
      </div>
    </Link>
  );
}
