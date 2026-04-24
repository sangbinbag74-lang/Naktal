"use client";

import { useEffect, useState } from "react";

interface Props {
  annId: string;
  category: string;
  orgName: string;
  region: string;
  budget: number;
  bsisAmt?: number;
  lwltRate?: number;
  deadline: string;
  subCategories?: string[];
  aValueTotal?: number;
}

interface PredictionResult {
  predicted_bidders?: number;
  predicted_bidders_float?: number;
  model_version?: string;
  error?: string;
}

function budgetRange(budget: number): string {
  if (budget < 100_000_000) return "1억미만";
  if (budget < 300_000_000) return "1억-3억";
  if (budget < 1_000_000_000) return "3억-10억";
  if (budget < 3_000_000_000) return "10억-30억";
  return "30억이상";
}

export function ParticipantPrediction({
  annId: _annId,
  category,
  orgName,
  region,
  budget,
  bsisAmt = 0,
  lwltRate = 87.745,
  deadline,
  subCategories = [],
  aValueTotal = 0,
}: Props) {
  const [pred, setPred] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = new Date(deadline);
    const features = {
      category,
      orgName,
      region: region || "전국",
      budgetRange: budgetRange(budget),
      subcat_main: subCategories?.[0] ?? "",
      budget_log: budget > 0 ? Math.log(budget + 1) : 0,
      bsisAmt_log: bsisAmt > 0 ? Math.log(bsisAmt + 1) : 0,
      lwltRate,
      month: d.getMonth() + 1,
      season_q: Math.ceil((d.getMonth() + 1) / 3),
      year: d.getFullYear(),
      weekday: d.getDay(),
      days_to_deadline: 7,
      aValueTotal_log: aValueTotal > 0 ? Math.log(aValueTotal + 1) : 0,
      has_avalue: aValueTotal > 0 ? 1 : 0,
      org_avg_bidders: 0,
      category_avg_bidders: 0,
    };

    fetch("/api/ml-predict-participants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(features),
      signal: AbortSignal.timeout(5000),
    })
      .then(async (r) => {
        const data = (await r.json()) as PredictionResult;
        if (data.error) {
          setError(data.error);
        } else if (data.predicted_bidders != null) {
          setPred(data.predicted_bidders);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [deadline, category, orgName, region, budget, bsisAmt, lwltRate, subCategories, aValueTotal]);

  if (loading) {
    return (
      <div style={card}>
        <div style={header}>🤖 예상 참여자 수 (AI)</div>
        <div style={{ fontSize: 12, color: "#94A3B8" }}>계산 중...</div>
      </div>
    );
  }

  if (error || pred == null) {
    return null; // 에러 시 UI에 표시 안 함 (폴백)
  }

  // 예상 참여자 수에 따른 경쟁 강도 색상
  const level =
    pred >= 100 ? { color: "#DC2626", label: "매우 높음" }
    : pred >= 50 ? { color: "#D97706", label: "높음" }
    : pred >= 20 ? { color: "#1B3A6B", label: "보통" }
    : { color: "#059669", label: "낮음" };

  // 간단한 신뢰구간 (±σ, 모델 RMSE 기준 추정)
  const sigma = Math.max(5, Math.round(pred * 0.2));

  return (
    <div style={card}>
      <div style={header}>🤖 예상 참여자 수 (AI)</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: level.color }}>{pred}명</span>
        <span style={{ fontSize: 12, color: "#64748B" }}>±{sigma}명</span>
      </div>
      <div style={{ fontSize: 12, color: level.color, fontWeight: 600, marginBottom: 8 }}>
        경쟁 강도: {level.label}
      </div>
      <div style={{ fontSize: 11, color: "#94A3B8", lineHeight: 1.5 }}>
        공고 특성(발주처·업종·예산·지역·시즌)으로 예측한 최종 참여자 수입니다.
        마감 임박시 실시간 크롤링 수치와 다를 수 있습니다.
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E8ECF2",
  borderRadius: 12,
  padding: "16px 18px",
  marginBottom: 12,
};
const header: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#0F172A",
  marginBottom: 10,
};
