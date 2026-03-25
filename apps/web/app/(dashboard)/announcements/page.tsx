"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
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

const REGION_GROUPS: { label: string; items: string[] }[] = [
  { label: "── 수도권", items: ["서울","경기","인천"] },
  { label: "── 경기 주요시", items: ["수원시","성남시","용인시","고양시","화성시","안산시","남양주시","안양시","평택시","시흥시","부천시","광명시","광주시","이천시","파주시","김포시","의정부시"] },
  { label: "── 충청", items: ["충북","충남","대전","세종"] },
  { label: "── 전라", items: ["전북","전남","광주"] },
  { label: "── 경상", items: ["경북","경남","부산","대구","울산"] },
  { label: "── 강원/제주", items: ["강원","제주"] },
];

const PRTCPTN_FILTERS = [
  { key: "", label: "전체" },
  { key: "전국", label: "전국" },
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

export default function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [folderIds, setFolderIds] = useState<string[]>([]);

  useEffect(() => { setFolderIds(getFolderIds()); }, []);

  const [keyword, setKeyword] = useState("");
  const [konepsId, setKonepsId] = useState("");
  const [category, setCategory] = useState("");
  const [region, setRegion] = useState("");
  const [sort, setSort] = useState("latest");
  const [contractMethod, setContractMethod] = useState("");
  const [deadlineRange, setDeadlineRange] = useState("active");
  const [minBudget, setMinBudget] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [budgetPreset, setBudgetPreset] = useState("");
  const [prtcptnLmt, setPrtcptnLmt] = useState("");
  const [ntceKind, setNtceKind] = useState("");

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const fetchData = useCallback(
    async (currentPage: number, reset = false) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(currentPage), limit: "20", sort });
        if (keyword)        params.set("keyword", keyword);
        if (konepsId)       params.set("konepsId", konepsId);
        if (category)       params.set("category", category);
        if (region)         params.set("region", region);
        if (contractMethod) params.set("contractMethod", contractMethod);
        if (deadlineRange)  params.set("deadlineRange", deadlineRange);
        if (minBudget)      params.set("minBudget", minBudget);
        if (maxBudget)      params.set("maxBudget", maxBudget);
        if (prtcptnLmt)     params.set("prtcptnLmt", prtcptnLmt);
        if (ntceKind)       params.set("ntceKind", ntceKind);
        const res = await fetch(`/api/announcements?${params}`);
        const json = (await res.json()) as ApiResponse;
        setItems((prev) => (reset ? (json.data ?? []) : [...prev, ...(json.data ?? [])]));
        setHasMore(json.hasMore);
        setTotal(json.total);
      } catch {
        console.error("공고 목록 불러오기 실패");
      } finally {
        setLoading(false);
      }
    },
    [keyword, konepsId, category, region, sort, contractMethod, deadlineRange, minBudget, maxBudget, prtcptnLmt, ntceKind]
  );

  useEffect(() => {
    setPage(1);
    setItems([]);
    setHasMore(true);
    fetchData(1, true);
  }, [keyword, konepsId, category, region, sort, contractMethod, deadlineRange, minBudget, maxBudget, prtcptnLmt, ntceKind, fetchData]);

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
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.45} }`}</style>
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
            {CATEGORY_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.items.map((c) => <option key={c} value={c}>{c}</option>)}
              </optgroup>
            ))}
          </select>
          <select value={ntceKind} onChange={(e) => setNtceKind(e.target.value)} style={selectStyle}>
            {NTCE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
          <select value={region} onChange={(e) => setRegion(e.target.value)} style={selectStyle}>
            <option value="">전체 지역</option>
            {REGION_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.items.map((r) => <option key={r} value={r}>{r}</option>)}
              </optgroup>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={selectStyle}>
            <option value="latest">최신순</option>
            <option value="deadline">마감임박순</option>
          </select>
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

        {/* 참가지역 */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#94A3B8", minWidth: 40 }}>참가</span>
          {PRTCPTN_FILTERS.map((f) => {
            const isActive = prtcptnLmt === f.key;
            return (
              <button key={f.key} onClick={() => setPrtcptnLmt(f.key)} style={{
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
                  const bidMethod = rj.bidMthdNm || rj.cntrctMthdNm || rj.ntceKindNm || "-";
                  const isMultiple = isMultiplePriceBid(ann.rawJson);
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
                        { label: "낙찰하한율", value: lwltRate ? `${lwltRate}%` : "-", color: lwltRate ? "#DC2626" : "#94A3B8" },
                        { label: "낙찰방법",   value: bidMethod,                        color: "#1B3A6B" },
                        { label: "예가방법",   value: isMultiple ? "복수예가" : "단일예가", color: isMultiple ? "#059669" : "#64748B" },
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
