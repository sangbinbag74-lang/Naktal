"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface BidRateResult {
  recommended_rate: number;
  confidence_range: [number, number];
  similar_cases: number;
  warning: string | null;
  cached: boolean;
}

const DISCLAIMER =
  "본 AI 추천 투찰률은 과거 낙찰 데이터의 통계적 분석 결과입니다. 실제 낙찰을 보장하지 않으며, 입찰 참여 여부 및 투찰률 결정의 최종 책임은 이용자에게 있습니다.";

export default function AiRecommendPage() {
  const [form, setForm] = useState({
    budget: "",
    category: "",
    region: "",
    org_name: "",
    num_bidders: "",
    deadline: "",
  });
  const [result, setResult] = useState<BidRateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const body = {
      budget: parseInt(form.budget.replace(/,/g, ""), 10),
      category: form.category,
      region: form.region,
      org_name: form.org_name,
      num_bidders: form.num_bidders ? parseInt(form.num_bidders, 10) : undefined,
      deadline: form.deadline,
    };

    try {
      const res = await fetch("/api/ml/bid-rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as BidRateResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "서버 오류가 발생했습니다.");
        return;
      }
      setResult(data);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const rangeWidth =
    result
      ? Math.min(
          100,
          Math.max(
            10,
            ((result.confidence_range[1] - result.confidence_range[0]) / 5) * 100
          )
        )
      : 0;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">AI 투찰률 추천</h2>
        <p className="text-sm text-gray-500 mt-1">
          공고 정보를 입력하면 AI가 최적 투찰률을 분석합니다.
        </p>
      </div>

      {/* 입력 폼 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">공고 정보 입력</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  예산 (원) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="budget"
                  value={form.budget}
                  onChange={handleChange}
                  placeholder="예: 50000000"
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  업종 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="category"
                  value={form.category}
                  onChange={handleChange}
                  placeholder="예: 토목공사"
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  지역 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="region"
                  value={form.region}
                  onChange={handleChange}
                  placeholder="예: 서울특별시"
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  발주기관 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="org_name"
                  value={form.org_name}
                  onChange={handleChange}
                  placeholder="예: 서울특별시청"
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  마감일 <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  name="deadline"
                  value={form.deadline}
                  onChange={handleChange}
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  예상 참여업체 수 <span className="text-gray-400">(선택)</span>
                </label>
                <input
                  type="number"
                  name="num_bidders"
                  value={form.num_bidders}
                  onChange={handleChange}
                  min={1}
                  placeholder="예: 10"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center rounded-md bg-[#1E3A5F] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#162d4a] disabled:opacity-50 transition-colors"
            >
              {loading ? "분석 중..." : "AI 분석 시작"}
            </button>
          </form>
        </CardContent>
      </Card>

      {/* 결과 */}
      {result && (
        <Card className="border-[#1E3A5F] border-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              AI 투찰률 추천 결과
              {result.cached && (
                <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                  캐시됨
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* 추천 투찰률 */}
            <div className="text-center py-4">
              <p className="text-sm text-gray-500 mb-1">추천 투찰률</p>
              <p className="text-6xl font-bold text-[#1E3A5F]">
                {result.recommended_rate}
                <span className="text-2xl ml-1">%</span>
              </p>
            </div>

            {/* 신뢰 구간 바 */}
            <div>
              <p className="text-sm text-gray-600 mb-2">
                신뢰 구간: {result.confidence_range[0]}% ~ {result.confidence_range[1]}%
              </p>
              <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="absolute h-full bg-blue-500 rounded-full opacity-40"
                  style={{ width: "100%" }}
                />
                <div
                  className="absolute top-0 h-full bg-[#1E3A5F] rounded-full"
                  style={{
                    left: `${((result.confidence_range[0] - 80) / 20) * 100}%`,
                    width: `${rangeWidth}%`,
                  }}
                />
                {/* 추천값 마커 */}
                <div
                  className="absolute top-0 h-full w-0.5 bg-red-500"
                  style={{
                    left: `${((result.recommended_rate - 80) / 20) * 100}%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>80%</span>
                <span>90%</span>
                <span>100%</span>
              </div>
            </div>

            {/* 유사 사례 수 */}
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="text-lg">📊</span>
              <span>
                유사 사례 <strong>{result.similar_cases.toLocaleString()}건</strong> 분석 기반
              </span>
            </div>

            {/* 경고 */}
            {result.warning && (
              <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded-md px-3 py-2">
                <span>⚠️</span>
                <span>{result.warning}</span>
              </div>
            )}

            {/* 면책 고지 — 삭제·숨김 금지 */}
            <div className="border-t pt-3">
              <p className="text-xs text-gray-500 leading-relaxed">
                ⚠️ {DISCLAIMER}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
