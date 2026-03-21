"use client";

import { useState } from "react";
import Link from "next/link";

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
  isFallback?: boolean;
  fallbackReason?: string;
  used: number;
  limit: number;
  announcementTitle?: string;
  announcementOrg?: string;
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
  for (const { nums, color } of [
    { nums: combo1, color: "#1B3A6B" },
    { nums: combo2, color: "#1E40AF" },
    { nums: combo3, color: "#2563EB" },
  ]) {
    for (const n of nums) {
      const b = Math.min(BUCKETS - 1, Math.floor(n / 20));
      if (!markedBuckets[b]) markedBuckets[b] = color;
    }
  }
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "18px 20px" }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 2 }}>번호 선택 빈도 히트맵</div>
        <div style={{ fontSize: 11, color: "#64748B" }}>초록 = 저빈도(추천) · 빨강 = 고빈도(회피) · <strong style={{ color: "#1B3A6B" }}>▲</strong> = 추천 번호</div>
      </div>
      <div style={{ display: "flex", gap: 2, alignItems: "flex-end" }}>
        {buckets.map((freq, i) => {
          const ratio = (maxFreq - minFreq) > 0 ? (freq - minFreq) / (maxFreq - minFreq) : 0;
          const bg = freq === 0 ? "#F1F5F9" : `hsl(${Math.round((1 - ratio) * 120)},65%,50%)`;
          const isMark = !!markedBuckets[i];
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              {isMark && <div style={{ fontSize: 7, color: markedBuckets[i], lineHeight: 1, fontWeight: 900 }}>▲</div>}
              <div style={{
                height: 28, width: "100%", background: bg, borderRadius: 3,
                border: isMark ? `2px solid ${markedBuckets[i]}` : "1px solid transparent",
                boxSizing: "border-box",
              }} title={`.${String(i * 20).padStart(3, "0")}~.${String(i * 20 + 19).padStart(3, "0")}: ${freq.toFixed(2)}%`} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        {[".000", ".200", ".400", ".600", ".800", ".999"].map((v) => (
          <span key={v} style={{ fontSize: 9, color: "#94A3B8" }}>{v}</span>
        ))}
      </div>
    </div>
  );
}

interface Props {
  annId: string;
  isClosed: boolean;
  bidMethod?: string;
}

export function NumberAnalysisSection({ annId, isClosed, bidMethod }: Props) {
  const [estimatedBidders, setEstimatedBidders] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgradeUrl, setUpgradeUrl] = useState<string | null>(null);

  async function handleAnalyze() {
    if (loading || isClosed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setUpgradeUrl(null);
    try {
      const res = await fetch("/api/strategy/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          annId,
          estimatedBidders: estimatedBidders ? parseInt(estimatedBidders) : undefined,
        }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setError(data.message ?? "사용 한도를 초과했습니다.");
        setUpgradeUrl(data.upgradeUrl ?? "/pricing");
        return;
      }
      if (!res.ok) {
        setError(data.message ?? data.error ?? "오류가 발생했습니다.");
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
    <div id="number-analysis" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>AI 번호 분석</span>
        <span style={{ fontSize: 10, fontWeight: 700, background: "#EEF2FF", color: "#1B3A6B", padding: "2px 7px", borderRadius: 4 }}>CORE 1</span>
      </div>

      {/* 마감된 공고 안내 */}
      {isClosed && (
        <div style={{ background: "#F1F5F9", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#64748B" }}>
          마감된 공고입니다. 번호 분석을 이용할 수 없습니다.
        </div>
      )}

      {!isClosed && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "18px 20px" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 500, marginBottom: 6 }}>
                예상 참여자 수 <span style={{ color: "#94A3B8" }}>(선택 — 미입력 시 업종 평균 적용)</span>
              </div>
              <input
                type="number"
                min={1}
                max={200}
                value={estimatedBidders}
                onChange={(e) => setEstimatedBidders(e.target.value)}
                placeholder="예: 15"
                style={{
                  height: 44, width: "100%", border: "1.5px solid #E8ECF2", borderRadius: 10,
                  fontSize: 13, padding: "0 12px", color: "#374151", background: "#fff",
                  outline: "none", boxSizing: "border-box",
                }}
                onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#1B3A6B"; }}
                onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "#E8ECF2"; }}
              />
            </div>
            <button
              onClick={handleAnalyze}
              disabled={loading}
              style={{
                height: 44, padding: "0 24px", flexShrink: 0,
                background: loading ? "#CBD5E1" : "#1B3A6B",
                color: "#fff", borderRadius: 10, fontSize: 14, fontWeight: 700,
                border: "none", cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "분석 중..." : "번호 추천 받기"}
            </button>
          </div>
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "14px 18px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#DC2626", marginBottom: upgradeUrl ? 8 : 0 }}>{error}</div>
          {upgradeUrl && (
            <Link href={upgradeUrl} style={{ fontSize: 13, color: "#1B3A6B", fontWeight: 600, textDecoration: "none" }}>
              요금제 업그레이드 →
            </Link>
          )}
        </div>
      )}

      {/* 결과 */}
      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {result.isFallback && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#92400E" }}>
              {result.fallbackReason ?? "AI 서버 점검 중입니다. 통계 기반 추천으로 제공됩니다."}
            </div>
          )}
          {result.isEstimated && !result.isFallback && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#92400E" }}>
              해당 조건의 데이터가 부족하여 통계 추정값을 사용했습니다.
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>추천 번호 조합</div>
            <div style={{ fontSize: 12, color: "#94A3B8" }}>
              분석 샘플 {result.sampleSize.toLocaleString()}건 · {result.modelVersion}
              {result.limit > 0 && (
                <span style={{ marginLeft: 8, color: result.used >= result.limit ? "#DC2626" : "#64748B" }}>
                  이번 달 {result.used}/{result.limit}회
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
              background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2",
              borderLeft: `4px solid ${accent}`, padding: "18px 22px",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
            }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: accent, marginBottom: 10, letterSpacing: "0.05em" }}>{label}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {combo.map((n, i) => (
                    <div key={i} style={{
                      width: 46, height: 46, borderRadius: "50%",
                      background: accent, color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 14, fontWeight: 700,
                    }}>
                      {String(n).padStart(2, "0")}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 2 }}>예상 적중률</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: accent }}>
                  {(hitRate * 100).toFixed(1)}<span style={{ fontSize: 13, fontWeight: 600 }}>%</span>
                </div>
              </div>
            </div>
          ))}

          {result.freqMap && Object.keys(result.freqMap).length > 0 && (
            <FreqHeatmap freqMap={result.freqMap} combo1={result.combo1} combo2={result.combo2} combo3={result.combo3} />
          )}

          <div style={{ background: "#FFF7ED", border: "1px solid #FDE68A", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#92400E", fontWeight: 500 }}>
            ⚠ 위 번호 조합은 과거 낙찰 데이터 통계를 기반으로 한 참고 자료이며, 낙찰을 보장하지 않습니다. 실제 입찰 전 반드시 전문가와 검토하세요.
          </div>
        </div>
      )}

      {bidMethod && !bidMethod.includes("복수예가") && (
        <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#64748B" }}>
          이 공고는 <strong>{bidMethod}</strong> 방식입니다. 번호 분석은 복수예가 방식 공고에서만 가능합니다.
        </div>
      )}
    </div>
  );
}
