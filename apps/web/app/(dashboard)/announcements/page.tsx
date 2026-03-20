"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

interface Announcement {
  id: string;
  konepsId: string;
  title: string;
  orgName: string;
  budget: string;
  deadline: string;
  category: string;
  region: string;
  createdAt: string;
}

interface ApiResponse {
  data: Announcement[];
  hasMore: boolean;
  total: number;
}

function getDDay(deadline: string): { label: string; bg: string; color: string } {
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return { label: "마감", bg: "#F1F5F9", color: "#475569" };
  if (diff <= 2) return { label: `D-${diff}`, bg: "#FEF2F2", color: "#DC2626" };
  if (diff <= 5) return { label: `D-${diff}`, bg: "#FFF7ED", color: "#C2410C" };
  if (diff <= 10) return { label: `D-${diff}`, bg: "#EFF6FF", color: "#1E40AF" };
  return { label: `D-${diff}`, bg: "#F8FAFC", color: "#475569" };
}

function formatBudget(budget: string): string {
  const num = parseInt(budget, 10);
  if (isNaN(num)) return budget;
  if (num >= 100000000) return `${(num / 100000000).toFixed(1)}억원`;
  if (num >= 10000) return `${(num / 10000).toFixed(0)}만원`;
  return new Intl.NumberFormat("ko-KR").format(num) + "원";
}

function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const QUICK_FILTERS = [
  { key: "", label: "전체" },
  { key: "deadline_today", label: "오늘마감" },
  { key: "deadline_3", label: "D-3이내" },
  { key: "multi_price", label: "복수예가" },
  { key: "small", label: "소액" },
];

const CATEGORIES = ["건설", "용역", "물품", "기타"];
const REGIONS = ["서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산", "세종", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];

export default function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");
  const [region, setRegion] = useState("");
  const [sort, setSort] = useState("latest");
  const [quickFilter, setQuickFilter] = useState("");

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const fetchData = useCallback(
    async (currentPage: number, reset = false) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(currentPage),
          limit: "20",
          sort,
          ...(keyword && { keyword }),
          ...(category && { category }),
          ...(region && { region }),
          ...(quickFilter && { quickFilter }),
        });
        const res = await fetch(`/api/announcements?${params}`);
        const json = (await res.json()) as ApiResponse;
        setItems((prev) => (reset ? json.data : [...prev, ...json.data]));
        setHasMore(json.hasMore);
        setTotal(json.total);
      } catch {
        console.error("공고 목록 불러오기 실패");
      } finally {
        setLoading(false);
      }
    },
    [keyword, category, region, sort, quickFilter]
  );

  useEffect(() => {
    setPage(1);
    setItems([]);
    setHasMore(true);
    fetchData(1, true);
  }, [keyword, category, region, sort, quickFilter, fetchData]);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loading) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchData(nextPage);
        }
      },
      { threshold: 0.1 }
    );
    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [hasMore, loading, page, fetchData]);

  const selectStyle: React.CSSProperties = {
    height: 38,
    border: "1px solid #E8ECF2",
    borderRadius: 9,
    fontSize: 13,
    padding: "0 10px",
    color: "#374151",
    background: "#fff",
    outline: "none",
    cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A" }}>공고 목록</h2>
          <p style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>총 {total.toLocaleString()}건</p>
        </div>
      </div>

      {/* 툴바 */}
      <div style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #E8ECF2",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="공고명, 발주기관 검색..."
            style={{
              flex: 1,
              height: 38,
              border: "1px solid #E8ECF2",
              borderRadius: 9,
              fontSize: 13,
              padding: "0 12px",
              outline: "none",
              color: "#374151",
            }}
            onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#1B3A6B"; }}
            onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "#E8ECF2"; }}
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
            <option value="">전체 업종</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={region} onChange={(e) => setRegion(e.target.value)} style={selectStyle}>
            <option value="">전체 지역</option>
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={selectStyle}>
            <option value="latest">최신순</option>
            <option value="deadline">마감임박순</option>
          </select>
        </div>

        {/* 빠른선택 필터 pill */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {QUICK_FILTERS.map((f) => {
            const isActive = quickFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setQuickFilter(f.key)}
                style={{
                  height: 28,
                  padding: "0 12px",
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 400,
                  border: `1px solid ${isActive ? "#1B3A6B" : "#E2E8F0"}`,
                  background: isActive ? "#1B3A6B" : "#fff",
                  color: isActive ? "#fff" : "#374151",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 공고 카드 목록 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((ann) => {
          const dday = getDDay(ann.deadline);
          return (
            <Link key={ann.id} href={`/announcements/${ann.id}`} style={{ textDecoration: "none" }}>
              <div style={{
                background: "#fff",
                borderRadius: 12,
                border: "1px solid #E8ECF2",
                overflow: "hidden",
                transition: "box-shadow 0.15s ease",
                cursor: "pointer",
              }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
              >
                {/* card-top */}
                <div style={{ padding: "14px 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                      {ann.category && (
                        <span style={{ fontSize: 10, fontWeight: 600, background: "#EEF2FF", color: "#1B3A6B", padding: "2px 6px", borderRadius: 4 }}>
                          {ann.category}
                        </span>
                      )}
                      {ann.region && (
                        <span style={{ fontSize: 10, fontWeight: 600, background: "#F8FAFC", color: "#64748B", padding: "2px 6px", borderRadius: 4 }}>
                          {ann.region}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ann.title}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748B", marginTop: 3 }}>
                      {ann.orgName} · {ann.konepsId}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 2 }}>기초금액</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#1B3A6B" }}>
                      {formatBudget(ann.budget)}
                    </div>
                    <div style={{
                      display: "inline-block",
                      marginTop: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      background: dday.bg,
                      color: dday.color,
                      padding: "2px 7px",
                      borderRadius: 4,
                    }}>
                      {dday.label} · {formatDeadline(ann.deadline)}
                    </div>
                  </div>
                </div>

                {/* card-mid */}
                <div style={{
                  padding: "8px 16px",
                  background: "#F8FAFC",
                  borderTop: "1px solid #F1F5F9",
                  borderBottom: "1px solid #F1F5F9",
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 8,
                }}>
                  {[
                    { label: "예가범위", value: "±2%" },
                    { label: "낙찰하한율", value: "87.745%" },
                    { label: "적격심사", value: "해당" },
                    { label: "발주처낙찰률", value: "-" },
                  ].map((item) => (
                    <div key={item.label} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 2 }}>{item.label}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: item.label === "낙찰하한율" ? "#DC2626" : item.label === "발주처낙찰률" ? "#059669" : "#1B3A6B" }}>
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* card-bot */}
                <div style={{ padding: "9px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {[ann.category, ann.region].filter(Boolean).map((tag) => (
                      <span key={tag} style={{ fontSize: 10, background: "#F1F5F9", color: "#64748B", padding: "2px 6px", borderRadius: 4 }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#1B3A6B", background: "#EEF2FF", padding: "4px 8px", borderRadius: 6, cursor: "pointer" }}>
                      AI 분석
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}

        <div ref={sentinelRef} style={{ height: 4 }} />

        {loading && (
          <div style={{ textAlign: "center", padding: "16px 0", fontSize: 13, color: "#94A3B8" }}>불러오는 중...</div>
        )}
        {!hasMore && items.length > 0 && (
          <div style={{ textAlign: "center", padding: "16px 0", fontSize: 13, color: "#94A3B8" }}>모든 공고를 불러왔습니다.</div>
        )}
        {!loading && items.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 0", fontSize: 14, color: "#94A3B8" }}>조건에 맞는 공고가 없습니다.</div>
        )}
      </div>
    </div>
  );
}
