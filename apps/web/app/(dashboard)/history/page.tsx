"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import type { VisitedAnn } from "@/components/naktal/AnnouncementTabs";

interface CachedAnalysis {
  bidStrategy: {
    optimalBidPrice: number;
    predictedSajungRate: number;
    sampleSize: number;
    lowerLimitPrice: number;
    winProbability: number;
    isFallback?: boolean;
  };
}

function fmt(n: number) { return n.toLocaleString("ko-KR") + "원"; }

function getDDay(deadline: string) {
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  if (diff <= 0) return { label: "마감", bg: "#F1F5F9", color: "#94A3B8" };
  if (diff <= 2) return { label: `D-${diff}`, bg: "#FEF2F2", color: "#DC2626" };
  if (diff <= 5) return { label: `D-${diff}`, bg: "#FFF7ED", color: "#C2410C" };
  if (diff <= 10) return { label: `D-${diff}`, bg: "#EFF6FF", color: "#1E40AF" };
  return { label: `D-${diff}`, bg: "#F1F5F9", color: "#475569" };
}

const selectStyle: React.CSSProperties = {
  height: 36, border: "1px solid #E2E8F0", borderRadius: 8,
  fontSize: 12, color: "#374151", background: "#fff",
  padding: "0 10px", cursor: "pointer", outline: "none",
};

export default function HistoryPage() {
  const [items, setItems] = useState<{ visited: VisitedAnn; analysis: CachedAnalysis | null }[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterRegion, setFilterRegion] = useState("");
  const [filterMultiple, setFilterMultiple] = useState<"all" | "yes" | "no">("all");
  const [filterClosed, setFilterClosed] = useState<"active" | "closed" | "all">("all");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/history/visits");
        if (!res.ok) throw new Error("fetch failed");
        const json = await res.json() as { visits: VisitedAnn[] };
        const result = (json.visits ?? []).map((v) => ({
          visited: v,
          analysis: (v.optimalBidPrice != null && v.predictedSajungRate != null && v.sampleSize != null)
            ? { bidStrategy: { optimalBidPrice: v.optimalBidPrice, predictedSajungRate: v.predictedSajungRate, sampleSize: v.sampleSize, lowerLimitPrice: 0, winProbability: 0 } } as CachedAnalysis
            : null,
        }));
        setItems(result);
      } catch {
        setItems([]);
      }
      setLoading(false);
    }
    void load();
  }, []);

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.visited.category).filter(Boolean))].sort(),
    [items],
  );
  const regions = useMemo(
    () => [...new Set(items.map((i) => i.visited.region).filter(Boolean))].sort(),
    [items],
  );

  const filtered = useMemo(() => items.filter(({ visited: v }) => {
    if (search && !v.title.includes(search) && !v.orgName.includes(search)) return false;
    if (filterCat && v.category !== filterCat) return false;
    if (filterRegion && v.region !== filterRegion) return false;
    if (filterMultiple === "yes" && !v.multiplePrice) return false;
    if (filterMultiple === "no" && v.multiplePrice) return false;
    if (filterClosed === "active" && v.isClosed) return false;
    if (filterClosed === "closed" && !v.isClosed) return false;
    return true;
  }), [items, search, filterCat, filterRegion, filterMultiple, filterClosed]);

  const isFiltered = search !== "" || filterCat !== "" || filterRegion !== "" || filterMultiple !== "all" || filterClosed !== "all";

  function resetFilters() {
    setSearch("");
    setFilterCat("");
    setFilterRegion("");
    setFilterMultiple("all");
    setFilterClosed("all");
  }

  if (loading) return <div style={{ padding: 40, color: "#94A3B8" }}>불러오는 중...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 헤더 */}
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>열람 이력</h2>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>
          열람한 공고 총 {items.length}건 · 열람한 공고가 자동으로 기록됩니다
          {isFiltered && ` · 필터 결과 ${filtered.length}건`}
        </p>
      </div>

      {/* 검색·필터 바 */}
      {items.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {/* 검색 */}
          <div style={{ position: "relative", flex: "1 1 200px", minWidth: 160 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#94A3B8", pointerEvents: "none" }}>🔍</span>
            <input
              type="text"
              placeholder="공고명 또는 발주처 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%", height: 36, border: "1px solid #E2E8F0", borderRadius: 8,
                fontSize: 12, color: "#374151", padding: "0 10px 0 30px",
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {/* 업종 */}
          <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={selectStyle}>
            <option value="">업종 전체</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* 지역 */}
          <select value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)} style={selectStyle}>
            <option value="">지역 전체</option>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>

          {/* 복수예가 */}
          <select value={filterMultiple} onChange={(e) => setFilterMultiple(e.target.value as "all" | "yes" | "no")} style={selectStyle}>
            <option value="all">예가 전체</option>
            <option value="yes">복수예가만</option>
            <option value="no">단일예가만</option>
          </select>

          {/* 마감 포함 */}
          <select value={filterClosed} onChange={(e) => setFilterClosed(e.target.value as "active" | "closed" | "all")} style={selectStyle}>
            <option value="active">진행 중만</option>
            <option value="all">마감 포함</option>
            <option value="closed">마감만</option>
          </select>

          {/* 초기화 */}
          {isFiltered && (
            <button
              onClick={resetFilters}
              style={{
                height: 36, padding: "0 12px", border: "1px solid #E2E8F0", borderRadius: 8,
                fontSize: 12, color: "#64748B", background: "#F8FAFC", cursor: "pointer",
              }}
            >
              초기화
            </button>
          )}
        </div>
      )}

      {/* 리스트 */}
      {items.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "56px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginBottom: 8 }}>아직 확인한 공고가 없습니다</div>
          <div style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 20 }}>공고 목록에서 공고를 클릭하면 이곳에 기록됩니다</div>
          <Link href="/announcements" style={{
            display: "inline-block", background: "#1B3A6B", color: "#fff",
            padding: "10px 24px", borderRadius: 10, textDecoration: "none",
            fontWeight: 600, fontSize: 14,
          }}>공고 목록 보기</Link>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 6 }}>검색 결과가 없습니다</div>
          <div style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 16 }}>다른 검색어나 필터를 사용해 보세요</div>
          <button onClick={resetFilters} style={{
            background: "#1B3A6B", color: "#fff", padding: "8px 20px",
            borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>필터 초기화</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(({ visited: v, analysis }) => {
            const dday = getDDay(v.deadline);
            const bs = analysis?.bidStrategy;
            return (
              <Link
                key={v.annDbId}
                href={`/announcements/${v.annDbId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none" }}
              >
                <div
                  style={{
                    background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2",
                    padding: "18px 22px", display: "flex", flexDirection: "column", gap: 10,
                    cursor: "pointer", transition: "box-shadow 0.15s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 12px rgba(27,58,107,0.10)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
                >
                  {/* 헤더 */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 5, marginBottom: 6, flexWrap: "wrap" }}>
                        {v.category && (
                          <span style={{ fontSize: 10, fontWeight: 600, background: "#EEF2FF", color: "#1B3A6B", padding: "2px 6px", borderRadius: 4 }}>
                            {v.category}
                          </span>
                        )}
                        {v.region && (
                          <span style={{ fontSize: 10, fontWeight: 600, background: "#F8FAFC", color: "#64748B", padding: "2px 6px", borderRadius: 4 }}>
                            {v.region}
                          </span>
                        )}
                        {v.multiplePrice && (
                          <span style={{ fontSize: 10, fontWeight: 600, background: "#ECFDF5", color: "#059669", padding: "2px 6px", borderRadius: 4 }}>
                            복수예가
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {v.title}
                      </div>
                      <div style={{ fontSize: 12, color: "#64748B", marginTop: 3 }}>
                        {v.orgName} · 기초금액 {fmt(v.budget)}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: dday.bg, color: dday.color }}>
                        {dday.label}
                      </span>
                      <span style={{ fontSize: 10, color: "#CBD5E1" }}>
                        {new Date(v.visitedAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })} 확인
                      </span>
                    </div>
                  </div>

                  {/* 분석 결과 */}
                  {bs ? (
                    <div style={{ display: "flex", gap: 12, background: "#F8FAFC", borderRadius: 10, padding: "12px 14px", flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 2 }}>AI 추천 투찰가</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#1B3A6B" }}>{fmt(bs.optimalBidPrice)}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 100 }}>
                        <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 2 }}>예측 사정율</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#374151" }}>{bs.predictedSajungRate.toFixed(2)}%</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 80 }}>
                        <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 2 }}>분석 샘플</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: bs.sampleSize >= 10 ? "#374151" : "#D97706" }}>
                          {bs.sampleSize.toLocaleString()}건
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "#CBD5E1", padding: "8px 0" }}>분석 결과 없음 — 공고를 열면 분석이 시작됩니다</div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
