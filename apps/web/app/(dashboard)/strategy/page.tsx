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
  freqMap?: Record<string, number>;
  sampleSize: number;
  modelVersion: string;
  isEstimated: boolean;
  used: number;
  limit: number;
}

function FreqHeatmap({ freqMap, combo1, combo2, combo3 }: {
  freqMap: Record<string, number>;
  combo1: number[];
  combo2: number[];
  combo3: number[];
}) {
  const BUCKETS = 50;
  const buckets: number[] = Array(BUCKETS).fill(0);

  for (let i = 0; i < BUCKETS; i++) {
    let sum = 0, cnt = 0;
    for (let j = i * 20; j < i * 20 + 20; j++) {
      const v = (freqMap as Record<number, number>)[j] ?? freqMap[String(j)];
      if (v !== undefined) { sum += v; cnt++; }
    }
    buckets[i] = cnt > 0 ? sum / cnt : 0;
  }

  const valid = buckets.filter((v) => v > 0);
  const maxFreq = valid.length ? Math.max(...valid) : 1;
  const minFreq = valid.length ? Math.min(...valid) : 0;

  const markedBuckets: Record<number, string> = {};
  const comboColors = [
    { nums: combo1, color: "#1B3A6B" },
    { nums: combo2, color: "#1E40AF" },
    { nums: combo3, color: "#2563EB" },
  ];
  for (const { nums, color } of comboColors) {
    for (const n of nums) {
      const b = Math.min(BUCKETS - 1, Math.floor(n / 20));
      if (!markedBuckets[b]) markedBuckets[b] = color;
    }
  }

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "20px 24px" }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 3 }}>번호 선택 빈도 히트맵</div>
        <div style={{ fontSize: 11, color: "#64748B" }}>
          초록 = 저빈도(추천 구간) · 빨강 = 고빈도(회피 구간) · <strong style={{ color: "#1B3A6B" }}>▲</strong> = 추천 번호 위치
        </div>
      </div>

      <div style={{ display: "flex", gap: 2, alignItems: "flex-end" }}>
        {buckets.map((freq, i) => {
          const range = maxFreq - minFreq;
          const ratio = range > 0 ? (freq - minFreq) / range : 0;
          const hue = Math.round((1 - ratio) * 120);
          const bg = freq === 0 ? "#F1F5F9" : `hsl(${hue}, 65%, 50%)`;
          const isMark = markedBuckets[i] !== undefined;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              {isMark && <div style={{ fontSize: 7, color: markedBuckets[i], lineHeight: 1, fontWeight: 900 }}>▲</div>}
              <div
                style={{
                  height: 32, width: "100%", background: bg, borderRadius: 3,
                  border: isMark ? `2px solid ${markedBuckets[i]}` : "1px solid transparent",
                  boxSizing: "border-box", cursor: "default",
                }}
                title={`.${String(i * 20).padStart(3, "0")}~.${String(i * 20 + 19).padStart(3, "0")}: ${freq.toFixed(2)}%`}
              />
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        {[".000", ".200", ".400", ".600", ".800", ".999"].map((v) => (
          <span key={v} style={{ fontSize: 9, color: "#94A3B8" }}>{v}</span>
        ))}
      </div>

      <div style={{ display: "flex", gap: 14, marginTop: 12 }}>
        {[
          { color: "hsl(120,65%,50%)", label: "저빈도 (추천)" },
          { color: "hsl(60,65%,50%)",  label: "중간" },
          { color: "hsl(0,65%,50%)",   label: "고빈도 (회피)" },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
            <span style={{ fontSize: 10, color: "#64748B" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
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

          {result.freqMap && Object.keys(result.freqMap).length > 0 && (
            <FreqHeatmap
              freqMap={result.freqMap}
              combo1={result.combo1}
              combo2={result.combo2}
              combo3={result.combo3}
            />
          )}

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
