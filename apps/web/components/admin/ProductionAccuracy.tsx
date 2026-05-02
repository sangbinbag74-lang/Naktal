import { createAdminClient } from "@/lib/supabase/server";

interface OutcomeRow {
  bidRate: number;
  actualBidRate: number | null;
  actualSajungRate: number | null;
  actualBidders: number | null;
  numBidders: number | null;
  actualOpeningIdx: number[] | null;
  recommendHit: boolean | null;
  result: string;
}

export async function ProductionAccuracy() {
  const admin = createAdminClient();
  const sinceMs = Date.now() - 90 * 86400000;
  const sinceIso = new Date(sinceMs).toISOString();

  const { data: rowsRaw, error } = await admin
    .from("BidOutcome")
    .select("bidRate,actualBidRate,actualSajungRate,actualBidders,numBidders,actualOpeningIdx,recommendHit,result,bidAt")
    .neq("result", "PENDING")
    .gte("bidAt", sinceIso);

  if (error) {
    return (
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#DC2626" }}>Production 정확도 조회 실패: {error.message}</div>
      </div>
    );
  }

  const rows = (rowsRaw ?? []) as unknown as OutcomeRow[];
  const total = rows.length;

  // Model 1 사정율 측정: bidRate vs actualBidRate (사용자 투찰률 vs 실제 낙찰률)
  const sajungRows = rows.filter((r) => r.actualBidRate != null && r.bidRate != null);
  const sajungMae = sajungRows.length > 0
    ? sajungRows.reduce((s, r) => s + Math.abs(Number(r.bidRate) - Number(r.actualBidRate)), 0) / sajungRows.length
    : null;

  // Model 2 적중률
  const recCnt = rows.filter((r) => r.recommendHit != null).length;
  const recHit = rows.filter((r) => r.recommendHit === true).length;
  const recHitRate = recCnt > 0 ? (recHit / recCnt) * 100 : null;

  // 피드백 채움율
  const biddersFill = rows.filter((r) => r.actualBidders != null).length;
  const openingFill = rows.filter((r) => r.actualOpeningIdx != null && r.actualOpeningIdx.length > 0).length;

  const cards: { label: string; value: string; sub: string; color: string }[] = [
    {
      label: "Model 1 실측 MAE (90일)",
      value: sajungMae != null ? sajungMae.toFixed(4) + "%p" : "-",
      sub: `샘플 ${sajungRows.length}건`,
      color: sajungMae == null ? "#94A3B8" : sajungMae < 0.6 ? "#059669" : sajungMae < 1.0 ? "#D97706" : "#DC2626",
    },
    {
      label: "Model 2 추천 적중률",
      value: recHitRate != null ? recHitRate.toFixed(1) + "%" : "-",
      sub: `${recHit}/${recCnt}건`,
      color: recHitRate == null ? "#94A3B8" : recHitRate >= 30 ? "#059669" : "#D97706",
    },
    {
      label: "actualBidders 채움율",
      value: total > 0 ? ((biddersFill / total) * 100).toFixed(1) + "%" : "-",
      sub: `${biddersFill}/${total}건`,
      color: "#1B3A6B",
    },
    {
      label: "actualOpeningIdx 채움율",
      value: total > 0 ? ((openingFill / total) * 100).toFixed(1) + "%" : "-",
      sub: `${openingFill}/${total}건`,
      color: "#1B3A6B",
    },
  ];

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>Production 실측 정확도</div>
      <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 14 }}>
        지난 90일 BidOutcome (PENDING 제외) 기준. 학습 지표와 다를 수 있음.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {cards.map((c) => (
          <div key={c.label} style={{ background: "#F8FAFC", border: "1px solid #E8ECF2", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 4 }}>{c.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
