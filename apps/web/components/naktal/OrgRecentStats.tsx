"use client";

import { useEffect, useState } from "react";
import type { OrgRecentStatsResponse } from "@/app/api/orgs/recent-stats/route";

interface Props {
  orgName: string;
  months?: number;
}

export function OrgRecentStats({ orgName, months = 3 }: Props) {
  const [data, setData] = useState<OrgRecentStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgName) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/orgs/recent-stats?orgName=${encodeURIComponent(orgName)}&months=${months}`)
      .then((r) => r.json())
      .then((j: OrgRecentStatsResponse) => { if (!cancelled) setData(j); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgName, months]);

  if (loading) {
    return (
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "20px 24px" }}>
        <div style={{ fontSize: 14, color: "#94A3B8", textAlign: "center" }}>발주처 통계 분석 중...</div>
      </div>
    );
  }

  if (!data || data.totalCount === 0) {
    return (
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "20px 24px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>
          발주처 최근 {months}개월 통계
        </div>
        <div style={{ fontSize: 12, color: "#94A3B8" }}>최근 {months}개월 입찰 데이터 없음</div>
      </div>
    );
  }

  // 분포 최댓값 (막대 정규화용)
  const maxCount = Math.max(1, ...data.distribution.map((d) => d.count));
  const peakRate = data.distribution.reduce((a, b) => (b.count > a.count ? b : a)).rate;

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "16px 18px" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
        발주처 최근 {months}개월 통계
      </div>
      <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {orgName}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 3 }}>입찰건수</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>{data.totalCount}건</div>
        </div>
        <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 3 }}>평균 사정율</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>
            {data.avg != null ? `${data.avg.toFixed(2)}%` : "-"}
          </div>
        </div>
      </div>

      <div style={{ borderTop: "1px solid #F1F5F9", paddingTop: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>
            사정율 편차 분포 (100% 대비 %p)
          </div>
          {data.outOfRangeCount > 0 && (
            <div style={{ fontSize: 10, color: "#94A3B8" }}>
              범위 외 {data.outOfRangeCount}건
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {data.distribution.slice().reverse().map((d) => {
            const pct = (d.count / maxCount) * 100;
            const isPeak = d.rate === peakRate && d.count > 0;
            const label = `${d.rate >= 0 ? "+" : ""}${d.rate.toFixed(1)}`;
            return (
              <div key={d.rate} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <div style={{ width: 36, color: "#64748B", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {label}
                </div>
                <div style={{ flex: 1, height: 14, background: "#F1F5F9", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                  <div style={{
                    width: `${pct}%`, height: "100%",
                    background: isPeak ? "#1B3A6B" : "#60A5FA",
                    transition: "width 0.3s",
                  }} />
                </div>
                <div style={{ width: 28, color: "#0F172A", fontVariantNumeric: "tabular-nums", fontWeight: isPeak ? 700 : 500 }}>
                  {d.count}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
