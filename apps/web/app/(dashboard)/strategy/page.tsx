"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const CATEGORIES = ["건설", "전기공사", "정보통신", "소방", "문화재수리", "용역", "물품", "기타"];
const BUDGET_RANGES = [
  "1억 미만", "1억~2억", "2억~3억", "3억~5억",
  "5억~10억", "10억~30억", "30억~100억", "100억 이상",
];
const REGIONS = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

interface RecommendResult {
  combo1: number[];
  combo2: number[];
  combo3: number[];
  hitRate1: number;
  hitRate2: number;
  hitRate3: number;
  sampleSize: number;
  modelVersion: string;
  isEstimated: boolean;
  used: number;
  limit: number;
}

const inp: React.CSSProperties = {
  height: 44, border: "1.5px solid #E8ECF2", borderRadius: 10,
  fontSize: 13, padding: "0 12px", color: "#374151",
  background: "#fff", outline: "none", width: "100%", boxSizing: "border-box",
  cursor: "pointer",
};
const card: React.CSSProperties = {
  background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "24px",
};
const lbl: React.CSSProperties = {
  fontSize: 12, color: "#6B7280", fontWeight: 500, display: "block", marginBottom: 6,
};

function StrategyContent() {
  const searchParams = useSearchParams();
  const annId = searchParams.get("annId") ?? undefined;

  const [category, setCategory] = useState("");
  const [budgetRange, setBudgetRange] = useState("");
  const [region, setRegion] = useState("");
  const [estimatedBidders, setEstimatedBidders] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgradeUrl, setUpgradeUrl] = useState<string | null>(null);

  const canSubmit = !loading && !!category && !!budgetRange && !!region;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setUpgradeUrl(null);

    try {
      const res = await fetch("/api/strategy/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category, budgetRange, region,
          estimatedBidders: estimatedBidders ? parseInt(estimatedBidders) : undefined,
          annId,
        }),
      });
      const data = await res.json();

      if (res.status === 429) {
        setError(data.message ?? "사용 한도를 초과했습니다.");
        setUpgradeUrl(data.upgradeUrl ?? "/pricing");
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "오류가 발생했습니다.");
        return;
      }
      setResult(data);
    } catch {
      setError("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: 0 }}>번호 전략 분석</h2>
          <span style={{ fontSize: 10, fontWeight: 700, background: "#EEF2FF", color: "#1B3A6B", padding: "3px 8px", borderRadius: 6 }}>CORE 1</span>
        </div>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>
          조건을 입력하면 낙찰 데이터 기반 최적 번호 조합 3세트를 추천합니다.
        </p>
      </div>

      {annId && (
        <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#1E40AF" }}>
          공고 연동 모드 — 결과를 투찰 이력에 자동 기록합니다.
        </div>
      )}

      <div style={card}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: "0 0 16px" }}>분석 조건 입력</h3>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={lbl}>업종 <span style={{ color: "#DC2626" }}>*</span></label>
              <select value={category} onChange={e => setCategory(e.target.value)} style={inp} required>
                <option value="">업종 선택</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>예산 구간 <span style={{ color: "#DC2626" }}>*</span></label>
              <select value={budgetRange} onChange={e => setBudgetRange(e.target.value)} style={inp} required>
                <option value="">예산 구간 선택</option>
                {BUDGET_RANGES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>지역 <span style={{ color: "#DC2626" }}>*</span></label>
              <select value={region} onChange={e => setRegion(e.target.value)} style={inp} required>
                <option value="">지역 선택</option>
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>예상 참여자 수 <span style={{ color: "#94A3B8" }}>(선택)</span></label>
              <input
                type="number"
                min={1}
                max={200}
                value={estimatedBidders}
                onChange={e => setEstimatedBidders(e.target.value)}
                placeholder="예: 15"
                style={{ ...inp, cursor: "text" }}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = "#1B3A6B"; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = "#E8ECF2"; }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              height: 50,
              background: canSubmit ? "#1B3A6B" : "#CBD5E1",
              color: "#fff", borderRadius: 12, fontSize: 15, fontWeight: 700,
              border: "none", cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {loading ? "분석 중..." : "번호 조합 추천받기"}
          </button>
        </form>
      </div>

      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: "16px 20px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#DC2626", marginBottom: 6 }}>{error}</div>
          {upgradeUrl && (
            <Link href={upgradeUrl} style={{ fontSize: 13, color: "#1B3A6B", fontWeight: 600, textDecoration: "none" }}>
              요금제 업그레이드 →
            </Link>
          )}
        </div>
      )}

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {result.isEstimated && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#92400E" }}>
              해당 조건의 데이터가 부족하여 통계 추정값을 사용했습니다. 데이터가 누적되면 정확도가 향상됩니다.
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>추천 번호 조합</div>
            <div style={{ fontSize: 12, color: "#94A3B8" }}>
              분석 샘플 {result.sampleSize.toLocaleString()}건 · {result.modelVersion}
              {result.limit > 0 && (
                <span style={{ marginLeft: 8, color: result.used >= result.limit ? "#DC2626" : "#64748B" }}>
                  {" "}이번 달 {result.used}/{result.limit}회 사용
                </span>
              )}
            </div>
          </div>

          {([
            { combo: result.combo1, hitRate: result.hitRate1, label: "조합 1", accent: "#1B3A6B" },
            { combo: result.combo2, hitRate: result.hitRate2, label: "조합 2", accent: "#1E40AF" },
            { combo: result.combo3, hitRate: result.hitRate3, label: "조합 3", accent: "#2563EB" },
          ] as const).map(({ combo, hitRate, label, accent }) => (
            <div key={label} style={{
              background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2",
              borderLeft: `4px solid ${accent}`, padding: "20px 24px",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: accent, marginBottom: 10, letterSpacing: "0.05em" }}>
                  {label}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {combo.map((n, i) => (
                    <div key={i} style={{
                      width: 50, height: 50, borderRadius: "50%",
                      background: accent, color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 15, fontWeight: 700, flexShrink: 0,
                    }}>
                      {String(n).padStart(2, "0")}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 2 }}>예상 적중률</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: accent }}>
                  {(hitRate * 100).toFixed(1)}<span style={{ fontSize: 14, fontWeight: 600 }}>%</span>
                </div>
              </div>
            </div>
          ))}

          <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "12px 16px", fontSize: 12, color: "#94A3B8" }}>
            위 번호 조합은 과거 낙찰 데이터 통계를 기반으로 한 참고 자료이며, 낙찰을 보장하지 않습니다.
          </div>
        </div>
      )}
    </div>
  );
}

export default function StrategyPage() {
  return (
    <Suspense fallback={<div style={{ padding: "48px 0", textAlign: "center", color: "#9CA3AF" }}>불러오는 중...</div>}>
      <StrategyContent />
    </Suspense>
  );
}
