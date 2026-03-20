"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

function isDeadlineSoon(deadline: string): boolean {
  const diff = new Date(deadline).getTime() - Date.now();
  return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000;
}

function formatBudget(budget: string): string {
  const num = parseInt(budget, 10);
  if (isNaN(num)) return budget;
  return new Intl.NumberFormat("ko-KR").format(num) + "원";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // 필터
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");
  const [region, setRegion] = useState("");
  const [sort, setSort] = useState("latest");

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
    [keyword, category, region, sort]
  );

  // 필터 변경 시 초기화
  useEffect(() => {
    setPage(1);
    setItems([]);
    setHasMore(true);
    fetchData(1, true);
  }, [keyword, category, region, sort, fetchData]);

  // Intersection Observer (무한스크롤)
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

  const CATEGORIES = ["건설", "용역", "물품", "기타"];
  const REGIONS = ["서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산", "세종", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">공고 목록</h2>
          <p className="text-sm text-gray-500 mt-1">총 {total.toLocaleString()}건</p>
        </div>
      </div>

      {/* 필터 */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="공고명, 발주기관 검색"
            className="flex-1 min-w-48 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
          >
            <option value="">전체 업종</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
          >
            <option value="">전체 지역</option>
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
          >
            <option value="latest">최신순</option>
            <option value="deadline">마감임박순</option>
          </select>
        </div>
      </div>

      {/* 목록 */}
      <div className="space-y-3">
        {items.map((ann) => (
          <Link key={ann.id} href={`/announcements/${ann.id}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {isDeadlineSoon(ann.deadline) && (
                        <Badge variant="destructive" className="text-xs shrink-0">
                          마감임박
                        </Badge>
                      )}
                      {ann.category && (
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {ann.category}
                        </Badge>
                      )}
                      {ann.region && (
                        <span className="text-xs text-gray-400">{ann.region}</span>
                      )}
                    </div>
                    <p className="font-medium text-gray-900 truncate">{ann.title}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{ann.orgName}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-[#1E3A5F]">{formatBudget(ann.budget)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      마감 {formatDate(ann.deadline)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}

        {/* 무한스크롤 센티넬 */}
        <div ref={sentinelRef} className="h-4" />

        {loading && (
          <div className="text-center py-4 text-sm text-gray-400">불러오는 중...</div>
        )}
        {!hasMore && items.length > 0 && (
          <div className="text-center py-4 text-sm text-gray-400">모든 공고를 불러왔습니다.</div>
        )}
        {!loading && items.length === 0 && (
          <div className="text-center py-12 text-gray-400">조건에 맞는 공고가 없습니다.</div>
        )}
      </div>
    </div>
  );
}
