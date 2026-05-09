import { PredictionsClient } from "./PredictionsClient";

export const dynamic = "force-dynamic";

export default function AdminPredictionsPage() {
  return (
    <div style={{ padding: "24px 32px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: "#0F172A" }}>
        AI 예측 vs 실제 결과
      </h1>
      <p style={{ fontSize: 13, color: "#64748B", marginBottom: 24 }}>
        진행중 공고: AI 추천 투찰가 / 마감 공고: 예측 vs 실제 낙찰 결과 비교.
        매시간 자동 분석 (GitHub Actions cron).
      </p>
      <PredictionsClient />
    </div>
  );
}
