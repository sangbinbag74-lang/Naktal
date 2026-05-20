"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { isMultiplePriceBid } from "@/lib/bid-utils";
import { CATEGORY_GROUPS } from "@/lib/category-map";
import { normalizeRegion } from "@/lib/region-alias";
import { KOREA_REGIONS, findProvince } from "@/lib/korea-regions";
import { BUDGET_PRESETS, REGION_GROUPS, type RegionItem } from "@/lib/announcements-filters";
// MaintenanceNotice 제거 — Ensemble 배포 검증 후 (2026-05-15)

const FOLDER_KEY = "naktal_folder";
function getFolderIds(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(FOLDER_KEY) ?? "[]"); } catch { return []; }
}
function toggleFolder(id: string): boolean {
  const ids = getFolderIds();
  const exists = ids.includes(id);
  localStorage.setItem(FOLDER_KEY, JSON.stringify(exists ? ids.filter((x) => x !== id) : [...ids, id]));
  return !exists;
}

const FILTERS_KEY = "naktal_ann_filters";
function getSavedFilters(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(FILTERS_KEY) ?? "{}") as Record<string, unknown>; } catch { return {}; }
}
function saveFilters(filters: Record<string, unknown>) {
  try { localStorage.setItem(FILTERS_KEY, JSON.stringify(filters)); } catch { /* 무시 */ }
}

interface PdfRgnLimit {
  type: "sigun" | "gwangyeok" | "national" | "unknown";
  label: string;
  raw?: string;
}

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
  rawJson?: Record<string, string> | null;
  aValueYn?: string | null;
  pdfRgnLimit?: PdfRgnLimit | null;
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

const DEADLINE_FILTERS = [
  { key: "active", label: "진행중" },
  { key: "today", label: "오늘마감" },
  { key: "3", label: "D-3이내" },
  { key: "7", label: "D-7이내" },
  { key: "30", label: "D-30이내" },
  { key: "", label: "전체(마감포함)" },
];

const CONTRACT_METHODS = [
  { key: "", label: "전체" },
  { key: "복수예가", label: "복수예가" },
  { key: "적격심사", label: "적격심사" },
  { key: "최저가", label: "최저가" },
  { key: "협상에의한계약", label: "협상계약" },
  { key: "제한경쟁", label: "제한경쟁" },
];

// 계약체결방법 (cntrctCnclsMthdNm) 세분 칩 — 분석 가능 공고만 토글과 별도
const CNCLS_TYPES = [
  { key: "", label: "전체" },
  { key: "일반경쟁", label: "일반경쟁" },
  { key: "제한경쟁", label: "제한경쟁" },
  { key: "수의계약", label: "수의계약" },
  { key: "기타", label: "기타" }, // 지명경쟁 등
];

// BUDGET_PRESETS, REGION_GROUPS, RegionItem 은 @/lib/announcements-filters 로 분리됨


const RGN_TYPE_FILTERS = [
  { key: "", label: "전체" },
  { key: "전국", label: "전국 참여" },
  { key: "관내", label: "지역제한 있음" },
];

const NTCE_KINDS = [
  { value: "", label: "전체 공사종류" },
  { value: "소수의 도급", label: "소수의 도급" },
  { value: "일반경쟁", label: "일반경쟁" },
  { value: "제한경쟁", label: "제한경쟁" },
  { value: "지명경쟁", label: "지명경쟁" },
  { value: "협상에의한계약", label: "협상계약" },
];

export default function AnnouncementsPage() {
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [items, setItems] = useState<Announcement[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [folderIds, setFolderIds] = useState<string[]>([]);

  useEffect(() => { setFolderIds(getFolderIds()); }, []);

  // Hydration-safe: 초기값은 SSR과 동일한 기본값으로 두고, 마운트 후 localStorage 복원
  const [keyword, setKeyword] = useState<string>("");
  const [konepsId, setKonepsId] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [catPanelOpen, setCatPanelOpen] = useState(false);
  const [regions, setRegions] = useState<string[]>([]);
  const [regionPanelOpen, setRegionPanelOpen] = useState(false);
  const [openProvinces, setOpenProvinces] = useState<Set<string>>(new Set());
  const [regionSearch, setRegionSearch] = useState<string>("");
  const [sort, setSort] = useState<string>("latest");
  const [contractMethod, setContractMethod] = useState<string>("");
  const [deadlineRange, setDeadlineRange] = useState<string>("active");
  const [minBudget, setMinBudget] = useState<string>("");
  const [maxBudget, setMaxBudget] = useState<string>("");
  const [budgetPreset, setBudgetPreset] = useState<string>("");
  const [rgnType, setRgnType] = useState<string>("");
  const [ntceKind, setNtceKind] = useState<string>("");
  const [cnclsType, setCnclsType] = useState<string>(""); // 계약체결방법 필터 (전체/일반/제한/수의/기타) — 기본 전체
  const [myProvince, setMyProvince] = useState<string>("");      // 내 사업장 광역 (예: "전북")
  const [myCity, setMyCity] = useState<string>("");              // 내 사업장 시·군 (예: "익산시")
  const [onlyMyRegion, setOnlyMyRegion] = useState<boolean>(false);

  // hydrated 플래그: localStorage 복원 완료 후에만 fetch 실행 (race condition 방지)
  const [hydrated, setHydrated] = useState(false);

  // 마운트 후 localStorage에서 필터 복원 (hydration mismatch 방지)
  useEffect(() => {
    const saved = getSavedFilters();
    if (typeof saved.keyword === "string")        setKeyword(saved.keyword);
    if (Array.isArray(saved.categories))           setCategories(saved.categories as string[]);
    if (Array.isArray(saved.regions))              setRegions(saved.regions as string[]);
    if (typeof saved.sort === "string")            setSort(saved.sort);
    if (typeof saved.contractMethod === "string")  setContractMethod(saved.contractMethod);
    if (typeof saved.deadlineRange === "string")   setDeadlineRange(saved.deadlineRange);
    if (typeof saved.minBudget === "string")       setMinBudget(saved.minBudget);
    if (typeof saved.maxBudget === "string")       setMaxBudget(saved.maxBudget);
    if (typeof saved.budgetPreset === "string")    setBudgetPreset(saved.budgetPreset);
    if (typeof saved.rgnType === "string")         setRgnType(saved.rgnType);
    if (typeof saved.ntceKind === "string")        setNtceKind(saved.ntceKind);
    if (typeof saved.cnclsType === "string")       setCnclsType(saved.cnclsType);
    if (typeof saved.myProvince === "string")      setMyProvince(saved.myProvince);
    if (typeof saved.myCity === "string")          setMyCity(saved.myCity);
    if (typeof saved.onlyMyRegion === "boolean")   setOnlyMyRegion(saved.onlyMyRegion);
    setHydrated(true);
  }, []);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(
    async (currentPage: number, reset = false) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(currentPage), limit: "20", sort });
        if (keyword)            params.set("keyword", keyword);
        if (konepsId)           params.set("konepsId", konepsId);
        if (categories.length)  params.set("categories", categories.join(","));
        if (regions.length)     params.set("regions", regions.join(","));
        if (contractMethod) params.set("contractMethod", contractMethod);
        if (deadlineRange)  params.set("deadlineRange", deadlineRange);
        if (minBudget)      params.set("minBudget", minBudget);
        if (maxBudget)      params.set("maxBudget", maxBudget);
        if (rgnType)        params.set("rgnType", rgnType);
        if (ntceKind)       params.set("ntceKind", ntceKind);
        if (cnclsType)      params.set("cnclsType", cnclsType);
        if (onlyMyRegion && myProvince) {
          // 내 사업장 광역 + 시 (시는 선택사항)
          const tokens: string[] = [myProvince];
          if (myCity) tokens.push(myCity);
          params.set("myRegions", tokens.join(","));
        }
        // 박상빈님 5/20 — 브라우저 캐시 우회 (옛 응답 표시 방지)
        const res = await fetch(`/api/announcements?${params}`, { cache: "no-store" });
        const json = (await res.json()) as ApiResponse;
        const newItems: Announcement[] = json.data ?? [];
        setItems((prev) => (reset ? newItems : [...prev, ...newItems]));
        setHasMore(json.hasMore);
        setTotal(json.total);
      } catch {
        console.error("공고 목록 불러오기 실패");
      } finally {
        setLoading(false);
      }
    },
    [keyword, konepsId, categories, regions, sort, contractMethod, deadlineRange, minBudget, maxBudget, rgnType, ntceKind, cnclsType, onlyMyRegion, myProvince, myCity]
  );

  const triggerDebouncedSearch = useCallback(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setPage(1);
      setItems([]);
      setHasMore(true);
      fetchData(1, true);
    }, 500);
  }, [fetchData]);

  // localStorage 복원 후 1회만 자동 조회 (hydrated 플래그로 race condition 방지)
  useEffect(() => {
    if (!hydrated) return;
    fetchData(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const handleSearch = () => {
    // 진행 중인 debounce 타이머 즉시 취소 — 클릭 결과를 옛 콜백이 덮어쓰는 race condition 방지
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    saveFilters({ keyword, categories, regions, sort, contractMethod, deadlineRange, minBudget, maxBudget, budgetPreset, rgnType, ntceKind, cnclsType, myProvince, myCity, onlyMyRegion });
    setPage(1);
    setItems([]);
    setHasMore(true);
    fetchData(1, true);
  };

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

  const skeletonStyle: React.CSSProperties = {
    background: "#E8ECF2",
    borderRadius: 4,
    animation: "pulse 1.5s ease-in-out infinite",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
        .ann-card { transition: box-shadow 0.15s ease, opacity 0.15s ease; cursor: pointer; }
        .ann-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
        .ann-card.navigating { opacity: 0.6; pointer-events: none; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .ann-card-spinner { animation: spin 0.7s linear infinite; }
      `}</style>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A" }}>공고 목록</h2>
          <p style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
            {total > 0 ? `${total.toLocaleString()}건 표시 중` : "나라장터 공고 목록"}
            {" · "}매일 자정 G2B 자동 동기화
          </p>
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
            onChange={(e) => { setKeyword(e.target.value); if (e.target.value) triggerDebouncedSearch(); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
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
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setCatPanelOpen(o => !o)}
              style={{
                ...selectStyle,
                display: "flex", alignItems: "center", gap: 6,
                paddingRight: 28, minWidth: 120,
                background: categories.length > 0 ? "#EEF2FF" : "#fff",
                borderColor: categories.length > 0 ? "#1B3A6B" : "#E8ECF2",
                color: categories.length > 0 ? "#1B3A6B" : "#374151",
                fontWeight: categories.length > 0 ? 600 : 400,
              }}
            >
              {categories.length === 0 ? "전체 업종" : `업종 ${categories.length}개`}
              <span style={{ position: "absolute", right: 8, fontSize: 10, color: "#94A3B8" }}>▾</span>
            </button>
            {catPanelOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setCatPanelOpen(false)} />
                <div style={{
                  position: "absolute", top: 42, left: 0, zIndex: 100,
                  background: "#fff", border: "1px solid #E8ECF2", borderRadius: 12,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: "12px 0",
                  minWidth: 220, maxHeight: 420, overflowY: "auto",
                }}>
                  <div style={{ padding: "4px 14px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600 }}>업종 선택</span>
                    {categories.length > 0 && (
                      <button onClick={() => setCategories([])} style={{ fontSize: 11, color: "#DC2626", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                        전체해제
                      </button>
                    )}
                  </div>
                  {Object.entries(CATEGORY_GROUPS).map(([groupName, groupCats]) => {
                    const selectedInGroup = groupCats.filter(c => categories.includes(c)).length;
                    const allSelected = selectedInGroup === groupCats.length;
                    return (
                      <div key={groupName}>
                        <div style={{ fontSize: 10, color: "#94A3B8", padding: "6px 14px 3px",
                          fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span>── {groupName}</span>
                          <button onClick={() => {
                            if (allSelected) {
                              setCategories(prev => prev.filter(c => !groupCats.includes(c)));
                            } else {
                              setCategories(prev => [
                                ...prev.filter(c => !groupCats.includes(c)),
                                ...groupCats,
                              ]);
                            }
                          }} style={{ fontSize: 10, color: selectedInGroup > 0 ? "#1B3A6B" : "#94A3B8",
                            background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                            {allSelected ? "전체해제" : "전체선택"}
                          </button>
                        </div>
                        {groupCats.map((cat) => {
                          const checked = categories.includes(cat);
                          return (
                            <label key={cat} style={{
                              display: "flex", alignItems: "center", gap: 8,
                              padding: "5px 14px", cursor: "pointer",
                              background: checked ? "#EEF2FF" : "transparent",
                              fontSize: 13,
                            }}
                              onMouseEnter={e => { if (!checked) (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = checked ? "#EEF2FF" : "transparent"; }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => setCategories(prev =>
                                  checked ? prev.filter(c => c !== cat) : [...prev, cat]
                                )}
                                style={{ accentColor: "#1B3A6B", width: 14, height: 14, cursor: "pointer" }}
                              />
                              <span style={{ color: checked ? "#1B3A6B" : "#374151", fontWeight: checked ? 600 : 400 }}>
                                {cat}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          <select value={ntceKind} onChange={(e) => setNtceKind(e.target.value)} style={selectStyle}>
            {NTCE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setRegionPanelOpen(o => !o)}
              style={{
                ...selectStyle,
                display: "flex", alignItems: "center", gap: 6,
                paddingRight: 28, minWidth: 120,
                background: regions.length > 0 ? "#EEF2FF" : "#fff",
                borderColor: regions.length > 0 ? "#1B3A6B" : "#E8ECF2",
                color: regions.length > 0 ? "#1B3A6B" : "#374151",
                fontWeight: regions.length > 0 ? 600 : 400,
              }}
            >
              {regions.length === 0 ? "전체 지역" : `지역 ${regions.length}개`}
              <span style={{ position: "absolute", right: 8, fontSize: 10, color: "#94A3B8" }}>▾</span>
            </button>
            {regionPanelOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setRegionPanelOpen(false)} />
                <div style={{
                  position: "absolute", top: 42, left: 0, zIndex: 100,
                  background: "#fff", border: "1px solid #E8ECF2", borderRadius: 12,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: "12px 0",
                  minWidth: 280, maxHeight: 480, overflowY: "auto",
                }}>
                  <div style={{ padding: "4px 14px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600 }}>발주지역 선택</span>
                    {regions.length > 0 && (
                      <button onClick={() => setRegions([])} style={{ fontSize: 11, color: "#DC2626", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                        전체해제
                      </button>
                    )}
                  </div>
                  {/* [G-6] 지역 검색박스 — 150개+ 지역 빠른 탐색 */}
                  <div style={{ padding: "0 14px 8px" }}>
                    <input
                      type="text"
                      value={regionSearch}
                      onChange={(e) => setRegionSearch(e.target.value)}
                      placeholder="지역 검색 (예: 강남, 성남)"
                      autoComplete="off"
                      style={{
                        width: "100%", height: 30, fontSize: 12,
                        border: "1px solid #E8ECF2", borderRadius: 6,
                        padding: "0 10px", outline: "none", color: "#374151",
                      }}
                      onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#1B3A6B"; }}
                      onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "#E8ECF2"; }}
                    />
                  </div>
                  {REGION_GROUPS.map((g) => {
                    // split items into sections: each province + its following cities
                    const sections: { province: RegionItem; cities: RegionItem[] }[] = [];
                    let current: { province: RegionItem; cities: RegionItem[] } | null = null;
                    for (const item of g.items) {
                      if (item.type === "province") {
                        current = { province: item, cities: [] };
                        sections.push(current);
                      } else if (current) {
                        current.cities.push(item);
                      }
                    }
                    // 검색어 필터: province 또는 cities 라벨에 매칭되는 section만 통과
                    const q = regionSearch.trim().toLowerCase();
                    const filteredSections = q
                      ? sections.filter(s =>
                          s.province.label.toLowerCase().includes(q) ||
                          s.cities.some(c => c.label.toLowerCase().includes(q)))
                      : sections;
                    if (filteredSections.length === 0) return null;
                    return (
                      <div key={g.label}>
                        <div style={{ fontSize: 10, color: "#94A3B8", padding: "6px 14px 2px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                          {g.label}
                        </div>
                        {filteredSections.map(({ province, cities }) => {
                          const provChecked = regions.includes(province.code);
                          // 검색어 있으면 자동 펼침, 없으면 사용자 토글 따름
                          const isOpen = q ? true : openProvinces.has(province.code);
                          // 검색어 매칭되는 city만 표시
                          const visibleCities = q
                            ? cities.filter(c =>
                                province.label.toLowerCase().includes(q) ||
                                c.label.toLowerCase().includes(q))
                            : cities;
                          const toggleOpen = () => setOpenProvinces(prev => {
                            const next = new Set(prev);
                            if (next.has(province.code)) next.delete(province.code); else next.add(province.code);
                            return next;
                          });
                          return (
                            <div key={province.code}>
                              {/* Province row */}
                              <div style={{ display: "flex", alignItems: "center" }}>
                                <label style={{
                                  display: "flex", alignItems: "center", gap: 8,
                                  padding: "7px 14px", cursor: "pointer", flex: 1,
                                  background: provChecked ? "#EEF2FF" : "transparent", fontSize: 13,
                                }}
                                  onMouseEnter={e => { if (!provChecked) (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = provChecked ? "#EEF2FF" : "transparent"; }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={provChecked}
                                    onChange={() => setRegions(prev =>
                                      provChecked ? prev.filter(r => r !== province.code) : [...prev, province.code]
                                    )}
                                    style={{ accentColor: "#1B3A6B", width: 14, height: 14, cursor: "pointer" }}
                                  />
                                  <span style={{ color: provChecked ? "#1B3A6B" : "#374151", fontWeight: 600, flex: 1 }}>
                                    {province.label}
                                  </span>
                                </label>
                                {visibleCities.length > 0 && !q && (
                                  <button
                                    onClick={toggleOpen}
                                    style={{
                                      background: "none", border: "none", cursor: "pointer",
                                      padding: "7px 12px", fontSize: 11, color: "#94A3B8",
                                      flexShrink: 0, lineHeight: 1,
                                    }}
                                    title={isOpen ? "접기" : "시·군·구 보기"}
                                  >
                                    {isOpen ? "▲" : "▼"}
                                  </button>
                                )}
                              </div>
                              {/* City rows (collapsible) */}
                              {isOpen && visibleCities.map((city) => {
                                const cityChecked = regions.includes(city.code);
                                return (
                                  <label key={city.code} style={{
                                    display: "flex", alignItems: "center", gap: 8,
                                    padding: "6px 14px 6px 32px", cursor: "pointer",
                                    background: cityChecked ? "#EEF2FF" : "transparent", fontSize: 12,
                                    borderLeft: "2px solid #E8ECF2", marginLeft: 14,
                                  }}
                                    onMouseEnter={e => { if (!cityChecked) (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = cityChecked ? "#EEF2FF" : "transparent"; }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={cityChecked}
                                      onChange={() => setRegions(prev =>
                                        cityChecked ? prev.filter(r => r !== city.code) : [...prev, city.code]
                                      )}
                                      style={{ accentColor: "#1B3A6B", width: 13, height: 13, cursor: "pointer" }}
                                    />
                                    <span style={{ color: cityChecked ? "#1B3A6B" : "#4B5563", fontWeight: cityChecked ? 600 : 400 }}>
                                      {city.label}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={selectStyle}>
            <option value="latest">최신순</option>
            <option value="deadline">마감임박순</option>
          </select>
          <button
            onClick={handleSearch}
            disabled={loading}
            style={{
              height: 38, padding: "0 20px", borderRadius: 9, fontSize: 13, fontWeight: 700,
              background: loading ? "#94A3B8" : "#1B3A6B", color: "#fff",
              border: "none", cursor: loading ? "default" : "pointer",
              whiteSpace: "nowrap", flexShrink: 0,
            }}
          >
            {loading ? "검색 중..." : "검색"}
          </button>
        </div>

        {/* 공고번호 검색 */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="text"
            value={konepsId}
            onChange={(e) => { setKonepsId(e.target.value); if (e.target.value.length >= 6) triggerDebouncedSearch(); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            placeholder="공고번호 직접 입력 (예: R26BK01367226)"
            style={{
              flex: 1,
              height: 36,
              border: "1px solid #E8ECF2",
              borderRadius: 9,
              fontSize: 12,
              padding: "0 12px",
              outline: "none",
              color: "#374151",
            }}
            onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#1B3A6B"; }}
            onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "#E8ECF2"; }}
          />
        </div>

        {/* 선택된 업종 태그 */}
        {categories.length > 0 && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#94A3B8", minWidth: 40 }}>업종</span>
            {categories.map(cat => (
              <span key={cat} style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                fontSize: 11, fontWeight: 600,
                background: "#EEF2FF", color: "#1B3A6B",
                padding: "2px 8px", borderRadius: 99,
                border: "1px solid #C7D2FE",
              }}>
                {cat}
                <button onClick={() => setCategories(prev => prev.filter(c => c !== cat))} style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 11, color: "#6366F1", padding: 0, lineHeight: 1,
                }}>×</button>
              </span>
            ))}
          </div>
        )}

        {/* 선택된 지역 태그 */}
        {regions.length > 0 && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#94A3B8", minWidth: 40 }}>지역</span>
            {regions.map(code => {
              const label = REGION_GROUPS.flatMap(g => g.items).find(i => i.code === code)?.label ?? code;
              return (
                <span key={code} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 11, fontWeight: 600,
                  background: "#EEF2FF", color: "#1B3A6B",
                  padding: "2px 8px", borderRadius: 99,
                  border: "1px solid #C7D2FE",
                }}>
                  {label}
                  <button onClick={() => setRegions(prev => prev.filter(r => r !== code))} style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 11, color: "#6366F1", padding: 0, lineHeight: 1,
                  }}>×</button>
                </span>
              );
            })}
          </div>
        )}

        {/* 참가 — 내 사업장 위치 기반 자동 매칭 (전국+내 도+내 시 모두) */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#94A3B8", minWidth: 40 }}>내 사업장</span>
          <select
            value={myProvince}
            onChange={(e) => { setMyProvince(e.target.value); setMyCity(""); }}
            style={{ height: 28, padding: "0 10px", borderRadius: 99, fontSize: 12, border: "1px solid #E2E8F0", background: "#fff", cursor: "pointer" }}
          >
            <option value="">광역시·도 선택</option>
            {KOREA_REGIONS.map((p) => (
              <option key={p.code} value={p.code}>{p.label}</option>
            ))}
          </select>
          <select
            value={myCity}
            onChange={(e) => setMyCity(e.target.value)}
            disabled={!myProvince}
            style={{ height: 28, padding: "0 10px", borderRadius: 99, fontSize: 12, border: "1px solid #E2E8F0", background: myProvince ? "#fff" : "#F8FAFC", cursor: myProvince ? "pointer" : "not-allowed", opacity: myProvince ? 1 : 0.5 }}
          >
            <option value="">시·군 선택 (선택사항)</option>
            {(findProvince(myProvince)?.cities ?? []).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <label style={{
            display: "flex", alignItems: "center", gap: 6, paddingLeft: 4,
            fontSize: 12, color: "#374151", cursor: myProvince ? "pointer" : "not-allowed",
            userSelect: "none", opacity: myProvince ? 1 : 0.5,
          }}
            title={myProvince
              ? `${myProvince}${myCity ? " " + myCity : ""} 업체로 참여 가능한 공고만 (전국 + 같은 도 + 같은 시 매칭)`
              : "광역시·도를 먼저 선택하세요"}
          >
            <input
              type="checkbox"
              checked={onlyMyRegion && !!myProvince}
              disabled={!myProvince}
              onChange={(e) => setOnlyMyRegion(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: "#059669", cursor: "inherit" }}
            />
            <span style={{ fontWeight: onlyMyRegion ? 600 : 400, color: onlyMyRegion ? "#059669" : "#64748B" }}>
              내 사업장 참여 가능만
            </span>
          </label>
        </div>

        {/* 참가제한 종류 (전체/전국/지역제한) */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#94A3B8", minWidth: 40 }}>참가</span>
          {RGN_TYPE_FILTERS.map((f) => {
            const isActive = rgnType === f.key;
            return (
              <button key={f.key} onClick={() => setRgnType(f.key)} style={{
                height: 28, padding: "0 12px", borderRadius: 99, fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                border: `1px solid ${isActive ? "#1B3A6B" : "#E2E8F0"}`,
                background: isActive ? "#1B3A6B" : "#fff",
                color: isActive ? "#fff" : "#374151",
                cursor: "pointer",
              }}>{f.label}</button>
            );
          })}
        </div>

        {/* 마감일 */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#94A3B8", minWidth: 40 }}>마감일</span>
          {DEADLINE_FILTERS.map((f) => {
            const isActive = deadlineRange === f.key;
            return (
              <button key={f.key} onClick={() => setDeadlineRange(f.key)} style={{
                height: 28, padding: "0 12px", borderRadius: 99, fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                border: `1px solid ${isActive ? "#1B3A6B" : "#E2E8F0"}`,
                background: isActive ? "#1B3A6B" : "#fff",
                color: isActive ? "#fff" : "#374151",
                cursor: "pointer",
              }}>{f.label}</button>
            );
          })}
        </div>

        {/* 계약방법 + 수의계약 제외 체크박스 */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#94A3B8", minWidth: 40 }}>계약</span>
          {CONTRACT_METHODS.map((f) => {
            const isActive = contractMethod === f.key;
            return (
              <button key={f.key} onClick={() => setContractMethod(f.key)} style={{
                height: 28, padding: "0 12px", borderRadius: 99, fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                border: `1px solid ${isActive ? "#1B3A6B" : "#E2E8F0"}`,
                background: isActive ? "#1B3A6B" : "#fff",
                color: isActive ? "#fff" : "#374151",
                cursor: "pointer",
              }}>{f.label}</button>
            );
          })}
          {/* 계약체결방법 칩 — 통합 검색 (default '전체') */}
          <div style={{ display: "flex", gap: 4, marginLeft: 8, paddingLeft: 10, borderLeft: "1px solid #E2E8F0", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#94A3B8", marginRight: 2 }}>체결</span>
            {CNCLS_TYPES.map((c) => {
              const isActive = cnclsType === c.key;
              return (
                <button key={c.key} onClick={() => setCnclsType(c.key)} style={{
                  height: 26, padding: "0 10px", borderRadius: 99, fontSize: 11,
                  fontWeight: isActive ? 600 : 400,
                  border: `1px solid ${isActive ? "#1B3A6B" : "#E2E8F0"}`,
                  background: isActive ? "#1B3A6B" : "#fff",
                  color: isActive ? "#fff" : "#374151",
                  cursor: "pointer",
                }}>{c.label}</button>
              );
            })}
          </div>
        </div>

        {/* 예산 */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#94A3B8", minWidth: 40 }}>예산</span>
          {BUDGET_PRESETS.map((f) => {
            const isActive = budgetPreset === f.label;
            return (
              <button key={f.label} onClick={() => {
                setBudgetPreset(f.label);
                setMinBudget(f.min);
                setMaxBudget(f.max);
              }} style={{
                height: 28, padding: "0 12px", borderRadius: 99, fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                border: `1px solid ${isActive ? "#1B3A6B" : "#E2E8F0"}`,
                background: isActive ? "#1B3A6B" : "#fff",
                color: isActive ? "#fff" : "#374151",
                cursor: "pointer",
              }}>{f.label}</button>
            );
          })}
          <input
            type="number"
            value={minBudget}
            onChange={(e) => { setMinBudget(e.target.value); setBudgetPreset(""); }}
            placeholder="최소금액"
            style={{ width: 90, height: 28, border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12, padding: "0 8px", outline: "none" }}
          />
          <span style={{ fontSize: 12, color: "#94A3B8" }}>~</span>
          <input
            type="number"
            value={maxBudget}
            onChange={(e) => { setMaxBudget(e.target.value); setBudgetPreset(""); }}
            placeholder="최대금액"
            style={{ width: 90, height: 28, border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12, padding: "0 8px", outline: "none" }}
          />
        </div>
      </div>

      {/* 공고 카드 목록 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {loading && items.length === 0 && Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "16px" }}>
            <div style={{ ...skeletonStyle, height: 12, width: "30%", marginBottom: 10 }} />
            <div style={{ ...skeletonStyle, height: 16, width: "80%", marginBottom: 8 }} />
            <div style={{ ...skeletonStyle, height: 12, width: "50%" }} />
          </div>
        ))}
        {items.map((ann) => {
          const dday = getDDay(ann.deadline);
          const isNavigating = navigatingId === (ann.konepsId || ann.id);
          return (
            <div
              key={ann.konepsId || ann.id}
              className={`ann-card${isNavigating ? " navigating" : ""}`}
              onClick={() => {
                setNavigatingId(ann.konepsId || ann.id);
                window.open(`/announcements/${ann.konepsId || ann.id}`, "_blank");
                setNavigatingId(null);
              }}
              style={{ textDecoration: "none" }}
            >
              <div style={{
                background: "#fff",
                borderRadius: 12,
                border: "1px solid #E8ECF2",
                overflow: "hidden",
                position: "relative",
              }}>
                {/* 로딩 오버레이 */}
                {isNavigating && (
                  <div style={{ position: "absolute", top: 10, right: 12, zIndex: 10, display: "flex", alignItems: "center", gap: 5 }}>
                    <div className="ann-card-spinner" style={{ width: 14, height: 14, border: "2px solid #E8ECF2", borderTopColor: "#1B3A6B", borderRadius: "50%" }} />
                    <span style={{ fontSize: 11, color: "#1B3A6B", fontWeight: 600 }}>불러오는 중...</span>
                  </div>
                )}
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
                      {isMultiplePriceBid(ann.rawJson) && (
                        <span style={{ fontSize: 10, fontWeight: 600, background: "#EFF6FF", color: "#1D4ED8", padding: "2px 6px", borderRadius: 4 }}>
                          복수예가
                        </span>
                      )}
                      {ann.aValueYn === "Y" && (
                        <span style={{ fontSize: 10, fontWeight: 600, background: "#ECFDF5", color: "#065F46", padding: "2px 6px", borderRadius: 4 }}>
                          A값 적용
                        </span>
                      )}
                      {ann.rawJson && (() => {
                        const cm = String(ann.rawJson.cntrctMthdNm ?? "");
                        const cc = String(ann.rawJson.cntrctCnclsMthdNm ?? "");
                        return cm.includes("수의") || cc.includes("수의");
                      })() && (
                        <span style={{ fontSize: 10, fontWeight: 600, background: "#FEF3C7", color: "#92400E", padding: "2px 6px", borderRadius: 4 }}>
                          수의계약
                        </span>
                      )}
                      {ann.rawJson && String(ann.rawJson.cntrctCnclsMthdNm ?? "").includes("제한") && (
                        <span style={{ fontSize: 10, fontWeight: 600, background: "#FEF3C7", color: "#92400E", padding: "2px 6px", borderRadius: 4 }}>
                          제한경쟁
                        </span>
                      )}
                      {ann.rawJson && String(ann.rawJson.cntrctCnclsMthdNm ?? "").includes("지명") && (
                        <span style={{ fontSize: 10, fontWeight: 600, background: "#FEF3C7", color: "#92400E", padding: "2px 6px", borderRadius: 4 }}>
                          지명경쟁
                        </span>
                      )}
                      {/* 참여 조건 — pdfRgnLimit (PDF 본문 추출 자격) 우선, 없으면 G2B API 필드 */}
                      {(() => {
                        // 1. PDF 본문 추출 결과 우선 (가장 정확)
                        const pdf = ann.pdfRgnLimit;
                        if (pdf && pdf.type !== "unknown") {
                          if (pdf.type === "sigun") {
                            return <span style={{ fontSize: 10, fontWeight: 600, background: "#FEF2F2", color: "#DC2626", padding: "2px 6px", borderRadius: 4 }} title={pdf.raw ?? `PDF: ${pdf.label}내 업체`}>📄 {pdf.label} 관내</span>;
                          }
                          if (pdf.type === "gwangyeok") {
                            return <span style={{ fontSize: 10, fontWeight: 600, background: "#FEF3C7", color: "#92400E", padding: "2px 6px", borderRadius: 4 }} title={pdf.raw ?? `PDF: ${pdf.label} 업체`}>📄 {pdf.label}</span>;
                          }
                          if (pdf.type === "national") {
                            return <span style={{ fontSize: 10, fontWeight: 600, background: "#ECFDF5", color: "#059669", padding: "2px 6px", borderRadius: 4 }} title={pdf.raw}>📄 전국 참여</span>;
                          }
                        }

                        // 2. PDF 미파싱 또는 unknown — G2B 명시 필드만
                        const limit       = String(ann.rawJson?.bidPrtcptLmtYn ?? "").trim();
                        const rgnDuty     = String(ann.rawJson?.rgnDutyJntcontrctYn ?? "").trim();
                        const cmmnSpldmd  = String(ann.rawJson?.cmmnSpldmdCorpRgnLmtYn ?? "").trim();
                        const rgnLmtBss   = String(ann.rawJson?.rgnLmtBidLocplcJdgmBssCd ?? "").trim();
                        const jnt1   = String(ann.rawJson?.jntcontrctDutyRgnNm1 ?? "").trim();
                        const jnt2   = String(ann.rawJson?.jntcontrctDutyRgnNm2 ?? "").trim();

                        const hasRgnLimit = limit === "Y" || cmmnSpldmd === "Y" || rgnLmtBss === "Y";
                        if (hasRgnLimit) {
                          if (jnt1) {
                            const canon = normalizeRegion(jnt1) ?? jnt1;
                            return <span style={{ fontSize: 10, fontWeight: 600, background: "#FEF2F2", color: "#DC2626", padding: "2px 6px", borderRadius: 4 }} title={[jnt1, jnt2].filter(Boolean).join(", ")}>{canon}{jnt2 ? "+" : ""} 제한</span>;
                          }
                          return <span style={{ fontSize: 10, fontWeight: 600, background: "#FEF2F2", color: "#DC2626", padding: "2px 6px", borderRadius: 4 }}>지역제한</span>;
                        }
                        if (rgnDuty === "Y" && jnt1) {
                          const canon = normalizeRegion(jnt1) ?? jnt1;
                          return <span style={{ fontSize: 10, fontWeight: 600, background: "#FFFBEB", color: "#92400E", padding: "2px 6px", borderRadius: 4 }} title={[jnt1, jnt2].filter(Boolean).join(", ")}>{canon} 의무공동</span>;
                        }

                        // 3. PDF 미파싱 + G2B 명시 제한 없음 → 보수적 안내
                        return <span style={{ fontSize: 10, fontWeight: 600, background: "#F1F5F9", color: "#94A3B8", padding: "2px 6px", borderRadius: 4 }} title="공고 PDF 본문 자격 확인 필수">📄 자격 확인</span>;
                      })()}
                      {ann.rawJson && Object.values(ann.rawJson).some((v) => typeof v === "string" && v.includes("긴급")) && (
                        <span style={{ fontSize: 10, fontWeight: 600, background: "#FEF2F2", color: "#DC2626", padding: "2px 6px", borderRadius: 4 }}>
                          긴급
                        </span>
                      )}
                      {ann.rawJson && Object.values(ann.rawJson).some((v) => typeof v === "string" && v.includes("재공고")) && (
                        <span style={{ fontSize: 10, fontWeight: 600, background: "#FFFBEB", color: "#92400E", padding: "2px 6px", borderRadius: 4 }}>
                          재공고
                        </span>
                      )}
                      {ann.rawJson?.prtcptnLmtNm && (() => {
                        const lmt = ann.rawJson!.prtcptnLmtNm;
                        const special: { text: string; bg: string; color: string }[] = [];
                        if (lmt.includes("여성"))       special.push({ text: "여성기업",  bg: "#FDF2F8", color: "#9D174D" });
                        if (lmt.includes("소상공인"))    special.push({ text: "소상공인",  bg: "#F5F3FF", color: "#6D28D9" });
                        if (lmt.includes("장애인"))     special.push({ text: "장애인기업", bg: "#F0FDFA", color: "#0F766E" });
                        if (lmt.includes("사회적기업"))  special.push({ text: "사회적기업", bg: "#EEF2FF", color: "#3730A3" });
                        if (lmt.includes("벤처"))       special.push({ text: "벤처기업",  bg: "#FAF5FF", color: "#7C3AED" });
                        if (special.length > 0) {
                          return special.map((b) => (
                            <span key={b.text} style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: b.bg, color: b.color }}>
                              {b.text}
                            </span>
                          ));
                        }
                        return (
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                            background: lmt.includes("전국") ? "#F0FDF4" : "#FFF7ED",
                            color:      lmt.includes("전국") ? "#166534" : "#92400E",
                          }}>
                            {lmt}
                          </span>
                        );
                      })()}
                      {ann.rawJson?.cntrctMthdNm?.includes("단가") && (
                        <span style={{ fontSize: 10, fontWeight: 600, background: "#F8FAFC", color: "#475569", padding: "2px 6px", borderRadius: 4 }}>
                          단가계약
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
                    <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 2 }}>추정가격</div>
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

                { /* card-bot */ }
                <div style={{ padding: '9px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {[ann.category, ann.region].filter(Boolean).map((tag) => (
                      <span key={tag} style={{ fontSize: 10, background: '#F1F5F9', color: '#64748B', padding: '2px 6px', borderRadius: 4 }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {isMultiplePriceBid(ann.rawJson) ? (
                      <a href={`/announcements/${ann.konepsId || ann.id}#number-analysis`} onClick={e => e.stopPropagation()} style={{ fontSize: 11, fontWeight: 600, color: '#1B3A6B', background: '#EEF2FF', padding: '4px 8px', borderRadius: 6, textDecoration: 'none' }}>
                        🎯 번호 분석
                      </a>
                    ) : (
                      <span title={`${ann.rawJson?.cntrctMthdNm ?? '단일예가'} · 번호분석 미지원`} style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', background: '#F1F5F9', padding: '4px 8px', borderRadius: 6, cursor: 'default' }}>
                        🎯 번호분석 미지원
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const saved = toggleFolder(ann.id);
                        setFolderIds(saved ? (prev) => [...prev, ann.id] : (prev) => prev.filter((x) => x !== ann.id));
                      }}
                      style={{
                        fontSize: 11, fontWeight: 600,
                        color: folderIds.includes(ann.id) ? '#92400E' : '#64748B',
                        background: folderIds.includes(ann.id) ? '#FEF3C7' : '#F8FAFC',
                        padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      }}
                    >
                      {folderIds.includes(ann.id) ? '★ 저장됨' : '☆ 저장'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
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
