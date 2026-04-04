"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { isMultiplePriceBid } from "@/lib/bid-utils";

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

const BUDGET_PRESETS = [
  { label: "전체", min: "", max: "" },
  { label: "1억 미만", min: "", max: "99999999" },
  { label: "1억~5억", min: "100000000", max: "499999999" },
  { label: "5억~10억", min: "500000000", max: "999999999" },
  { label: "10억 이상", min: "1000000000", max: "" },
];

const CATEGORY_GROUPS: { label: string; items: string[] }[] = [
  { label: "── 시설공사", items: [
    "토목공사","건축공사","토목건축공사","조경공사","전기공사","통신공사",
    "소방시설공사","기계설비공사","지반조성포장공사","실내건축공사",
    "철근콘크리트공사","구조물해체비계공사","상하수도설비공사","철강재설치공사",
    "삭도승강기기계설비공사","도장습식방수석공사","문화재수리공사",
  ]},
  { label: "── 용역", items: [
    "엔지니어링","측량","청소","경비","시설관리","연구용역","학술연구","기타용역",
  ]},
  { label: "── 물품/기타", items: ["물품","기타"] },
];

type RegionItem = { code: string; label: string; type: "province" | "city" };

const REGION_GROUPS: { label: string; items: RegionItem[] }[] = [
  { label: "수도권", items: [
    { code: "서울", label: "서울특별시", type: "province" },
    { code: "경기", label: "경기도 전체", type: "province" },
    { code: "수원시", label: "수원시", type: "city" },
    { code: "성남시", label: "성남시", type: "city" },
    { code: "용인시", label: "용인시", type: "city" },
    { code: "고양시", label: "고양시", type: "city" },
    { code: "화성시", label: "화성시", type: "city" },
    { code: "안산시", label: "안산시", type: "city" },
    { code: "평택시", label: "평택시", type: "city" },
    { code: "남양주시", label: "남양주시", type: "city" },
    { code: "안양시", label: "안양시", type: "city" },
    { code: "인천", label: "인천광역시", type: "province" },
  ]},
  { label: "충청권", items: [
    { code: "대전", label: "대전광역시", type: "province" },
    { code: "세종", label: "세종특별자치시", type: "province" },
    { code: "충북", label: "충청북도 전체", type: "province" },
    { code: "청주시", label: "청주시", type: "city" },
    { code: "충주시", label: "충주시", type: "city" },
    { code: "충남", label: "충청남도 전체", type: "province" },
    { code: "천안시", label: "천안시", type: "city" },
    { code: "아산시", label: "아산시", type: "city" },
  ]},
  { label: "전라권", items: [
    { code: "광주", label: "광주광역시", type: "province" },
    { code: "전북", label: "전북특별자치도 전체", type: "province" },
    { code: "전주시", label: "전주시", type: "city" },
    { code: "익산시", label: "익산시", type: "city" },
    { code: "군산시", label: "군산시", type: "city" },
    { code: "정읍시", label: "정읍시", type: "city" },
    { code: "남원시", label: "남원시", type: "city" },
    { code: "전남", label: "전라남도 전체", type: "province" },
    { code: "여수시", label: "여수시", type: "city" },
    { code: "순천시", label: "순천시", type: "city" },
    { code: "목포시", label: "목포시", type: "city" },
  ]},
  { label: "경상권", items: [
    { code: "부산", label: "부산광역시", type: "province" },
    { code: "대구", label: "대구광역시", type: "province" },
    { code: "울산", label: "울산광역시", type: "province" },
    { code: "경북", label: "경상북도 전체", type: "province" },
    { code: "포항시", label: "포항시", type: "city" },
    { code: "구미시", label: "구미시", type: "city" },
    { code: "경주시", label: "경주시", type: "city" },
    { code: "경남", label: "경상남도 전체", type: "province" },
    { code: "창원시", label: "창원시", type: "city" },
    { code: "진주시", label: "진주시", type: "city" },
    { code: "김해시", label: "김해시", type: "city" },
  ]},
  { label: "강원/제주", items: [
    { code: "강원", label: "강원특별자치도 전체", type: "province" },
    { code: "춘천시", label: "춘천시", type: "city" },
    { code: "원주시", label: "원주시", type: "city" },
    { code: "강릉시", label: "강릉시", type: "city" },
    { code: "제주", label: "제주특별자치도", type: "province" },
  ]},
];

const RGN_TYPE_FILTERS = [
  { key: "", label: "전체" },
  { key: "전국", label: "전국" },
  { key: "도", label: "도 업체" },
  { key: "시", label: "시 업체" },
  { key: "관내", label: "관내" },
];

const NTCE_KINDS = [
  { value: "", label: "전체 공사종류" },
  { value: "소수의 도급", label: "소수의 도급" },
  { value: "일반경쟁", label: "일반경쟁" },
  { value: "제한경쟁", label: "제한경쟁" },
  { value: "지명경쟁", label: "지명경쟁" },
  { value: "협상에의한계약", label: "협상계약" },
];

interface PredictionCache {
  optimalBidPrice: string;
  winProbability: number;
}

export default function AnnouncementsPage() {
  const router = useRouter();
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [items, setItems] = useState<Announcement[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [folderIds, setFolderIds] = useState<string[]>([]);
  const [predictions, setPredictions] = useState<Map<string, PredictionCache>>(new Map());

  useEffect(() => { setFolderIds(getFolderIds()); }, []);

  const [keyword, setKeyword] = useState<string>(() => String(getSavedFilters().keyword ?? ""));
  const [konepsId, setKonepsId] = useState("");
  const [categories, setCategories] = useState<string[]>(() => { const s = getSavedFilters().categories; return Array.isArray(s) ? s as string[] : []; });
  const [catPanelOpen, setCatPanelOpen] = useState(false);
  const [regions, setRegions] = useState<string[]>(() => { const s = getSavedFilters().regions; return Array.isArray(s) ? s as string[] : []; });
  const [regionPanelOpen, setRegionPanelOpen] = useState(false);
  const [sort, setSort] = useState<string>(() => String(getSavedFilters().sort ?? "latest"));
  const [contractMethod, setContractMethod] = useState<string>(() => String(getSavedFilters().contractMethod ?? ""));
  const [deadlineRange, setDeadlineRange] = useState<string>(() => String(getSavedFilters().deadlineRange ?? "active"));
  const [minBudget, setMinBudget] = useState<string>(() => String(getSavedFilters().minBudget ?? ""));
  const [maxBudget, setMaxBudget] = useState<string>(() => String(getSavedFilters().maxBudget ?? ""));
  const [budgetPreset, setBudgetPreset] = useState<string>(() => String(getSavedFilters().budgetPreset ?? ""));
  const [rgnType, setRgnType] = useState<string>(() => String(getSavedFilters().rgnType ?? ""));
  const [ntceKind, setNtceKind] = useState<string>(() => String(getSavedFilters().ntceKind ?? ""));

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

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
        const res = await fetch(`/api/announcements?${params}`);
        const json = (await res.json()) as ApiResponse;
        const newItems: Announcement[] = json.data ?? [];
        setItems((prev) => (reset ? newItems : [...prev, ...newItems]));
        setHasMore(json.hasMore);
        setTotal(json.total);

        // 예측 캐시 배치 조회 (없으면 "-" 표시)
        if (newItems.length > 0) {
          const ids = newItems.map((a) => a.id).join(",");
          fetch(`/api/analysis/predictions?annIds=${ids}`)
            .then((r) => r.json())
            .then((map: Record<string, PredictionCache>) => {
              setPredictions((prev) => {
                const next = new Map(prev);
                for (const [id, pred] of Object.entries(map)) next.set(id, pred);
                return next;
              });
            })
            .catch(() => {/* 예측 없으면 "-" 표시 유지 */});
        }
      } catch {
        console.error("공고 목록 불러오기 실패");
      } finally {
        setLoading(false);
      }
    },
    [keyword, konepsId, categories, regions, sort, contractMethod, deadlineRange, minBudget, maxBudget, rgnType, ntceKind]
  );

  // 최초 마운트 1회만 자동 조회
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(1, true); }, []);

  const handleSearch = () => {
    saveFilters({ keyword, categories, regions, sort, contractMethod, deadlineRange, minBudget, maxBudget, budgetPreset, rgnType, ntceKind });
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
            {" · "}매일 9·12·15·18시 동기화
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
            onChange={(e) => setKeyword(e.target.value)}
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
                  {CATEGORY_GROUPS.map((g) => (
                    <div key={g.label}>
                      <div style={{ fontSize: 10, color: "#94A3B8", padding: "4px 14px", fontWeight: 600, letterSpacing: "0.02em" }}>
                        {g.label}
                      </div>
                      {g.items.map((cat) => {
                        const checked = categories.includes(cat);
                        return (
                          <label key={cat} style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "6px 14px", cursor: "pointer",
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
                            <span style={{ color: checked ? "#1B3A6B" : "#374151", fontWeight: checked ? 600 : 400 }}>{cat}</span>
                          </label>
                        );
                      })}
                    </div>
                  ))}
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
                  minWidth: 240, maxHeight: 460, overflowY: "auto",
                }}>
                  <div style={{ padding: "4px 14px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600 }}>발주지역 선택</span>
                    {regions.length > 0 && (
                      <button onClick={() => setRegions([])} style={{ fontSize: 11, color: "#DC2626", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                        전체해제
                      </button>
                    )}
                  </div>
                  {REGION_GROUPS.map((g) => (
                    <div key={g.label}>
                      <div style={{ fontSize: 10, color: "#94A3B8", padding: "4px 14px", fontWeight: 600, letterSpacing: "0.02em" }}>
                        {g.label}
                      </div>
                      {g.items.map((item) => {
                        const checked = regions.includes(item.code);
                        return (
                          <label key={item.code} style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: `6px 14px 6px ${item.type === "city" ? "28px" : "14px"}`,
                            cursor: "pointer",
                            background: checked ? "#EEF2FF" : "transparent",
                            fontSize: 13,
                          }}
                            onMouseEnter={e => { if (!checked) (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = checked ? "#EEF2FF" : "transparent"; }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setRegions(prev =>
                                checked ? prev.filter(r => r !== item.code) : [...prev, item.code]
                              )}
                              style={{ accentColor: "#1B3A6B", width: 14, height: 14, cursor: "pointer" }}
                            />
                            <span style={{
                              color: checked ? "#1B3A6B" : "#374151",
                              fontWeight: item.type === "province" ? (checked ? 700 : 600) : (checked ? 600 : 400),
                            }}>{item.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  ))}
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
            onChange={(e) => setKonepsId(e.target.value)}
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

        {/* 계약방법 */}
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
        </div>

        {/* 참가제한 */}
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
          const isNavigating = navigatingId === ann.id;
          return (
            <div
              key={ann.id}
              className={`ann-card${isNavigating ? " navigating" : ""}`}
              onClick={() => {
                setNavigatingId(ann.id);
                router.push(`/announcements/${ann.id}`);
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
                      {ann.rawJson?.prtcptnLmtNm && (
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                          background: ann.rawJson.prtcptnLmtNm.includes("전국") ? "#F0FDF4" : "#FFF7ED",
                          color:      ann.rawJson.prtcptnLmtNm.includes("전국") ? "#166534" : "#92400E",
                        }}>
                          {ann.rawJson.prtcptnLmtNm}
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
                {(() => {
                  const rj = (ann.rawJson ?? {}) as Record<string, string>;
                  const lwltRate = rj.sucsfbidLwltRate;
                  const pred = predictions.get(ann.id);
                  const optimalBid = pred
                    ? formatBudget(pred.optimalBidPrice)
                    : "-";
                  const winProb = pred
                    ? `${Math.round(pred.winProbability * 100)}%`
                    : "-";
                  const probColor = pred
                    ? pred.winProbability >= 0.5
                      ? "#059669"
                      : pred.winProbability >= 0.3
                        ? "#C2410C"
                        : "#94A3B8"
                    : "#94A3B8";
                  return (
                    <div style={{
                      padding: "8px 16px",
                      background: "#F8FAFC",
                      borderTop: "1px solid #F1F5F9",
                      borderBottom: "1px solid #F1F5F9",
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: 8,
                    }}>
                      {[
                        { label: "낙찰하한율",    value: lwltRate ? `${lwltRate}%` : "-", color: lwltRate ? "#DC2626" : "#94A3B8" },
                        { label: "AI추천투찰가",  value: optimalBid,                       color: pred ? "#1B3A6B" : "#94A3B8" },
                        { label: "낙찰확률(AI)",  value: winProb,                          color: probColor },
                      ].map((item) => (
                        <div key={item.label} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 2 }}>{item.label}</div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: item.color }}>{item.value}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

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
                      <a href={`/announcements/${ann.id}#number-analysis`} onClick={e => e.stopPropagation()} style={{ fontSize: 11, fontWeight: 600, color: '#1B3A6B', background: '#EEF2FF', padding: '4px 8px', borderRadius: 6, textDecoration: 'none' }}>
                        🎯 번호 분석
                      </a>
                    ) : (
                      <span title={`${ann.rawJson?.cntrctMthdNm ?? '단일예가'} · 번호분석 미지원`} style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', background: '#F1F5F9', padding: '4px 8px', borderRadius: 6, cursor: 'default' }}>
                        🎯 번호분석 미지원
                      </span>
                    )}
                    <a href={`/qualification?annId=${ann.id}`} onClick={e => e.stopPropagation()} style={{ fontSize: 11, fontWeight: 600, color: '#166534', background: '#F0FDF4', padding: '4px 8px', borderRadius: 6, textDecoration: 'none' }}>
                      ✅ 적격심사
                    </a>
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
