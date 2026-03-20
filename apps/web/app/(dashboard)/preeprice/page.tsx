"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UpgradeBanner } from "@/components/ui/upgrade-banner";

interface Combo {
  numbers: number[];
  hit_rate: number;
}

interface PreepriceResult {
  combos: Combo[];
  sample_size: number;
  disclaimer: string;
  cached: boolean;
}

export default function PreepriceePage() {
  const [form, setForm] = useState({
    category: "",
    budget: "",
    num_bidders_est: "",
  });
  const [result, setResult] = useState<PreepriceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planError, setPlanError] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setPlanError(false);

    const body = {
      category: form.category,
      budget: parseInt(form.budget.replace(/,/g, ""), 10),
      num_bidders_est: parseInt(form.num_bidders_est, 10) || 5,
    };

    try {
      const res = await fetch("/api/ml/preeprice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 403) {
        setPlanError(true);
        return;
      }

      const data = (await res.json()) as PreepriceResult & { error?: string };
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

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">복수예가 번호 통계</h2>
        <p className="text-sm text-gray-500 mt-1">
          유사 공고의 낙찰 데이터를 분석해 번호 조합을 추천합니다.
        </p>
      </div>

      {/* 입력 폼 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">공고 조건 입력</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
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
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  예상 참여업체 수 <span className="text-gray-400">(선택)</span>
                </label>
                <input
                  type="number"
                  name="num_bidders_est"
                  value={form.num_bidders_est}
                  onChange={handleChange}
                  min={1}
                  placeholder="예: 10"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center rounded-md bg-[#1E3A5F] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#162d4a] disabled:opacity-50 transition-colors"
            >
              {loading ? "분석 중..." : "번호 통계 조회"}
            </button>
          </form>
        </CardContent>
      </Card>

      {/* 플랜 제한 */}
      {planError && (
        <UpgradeBanner
          feature="복수예가 번호 통계"
          className="mt-2"
        />
      )}

      {/* 결과 */}
      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">
              추천 번호 조합
              {result.cached && (
                <span className="ml-2 text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                  캐시됨
                </span>
              )}
            </h3>
            <span className="text-xs text-gray-500">
              유사 사례 {result.sample_size.toLocaleString()}건 분석
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {result.combos.map((combo, idx) => (
              <Card key={idx} className={idx === 0 ? "border-[#1E3A5F] border-2" : ""}>
                <CardContent className="pt-4 text-center space-y-3">
                  {idx === 0 && (
                    <span className="inline-block text-xs font-medium bg-[#1E3A5F] text-white px-2 py-0.5 rounded-full">
                      1순위
                    </span>
                  )}
                  <div className="flex justify-center gap-2">
                    {combo.numbers.map((n) => (
                      <div
                        key={n}
                        className="w-10 h-10 rounded-full bg-[#1E3A5F] text-white flex items-center justify-center font-bold text-lg"
                      >
                        {n}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">
                    과거 적중률{" "}
                    <span className="font-semibold text-gray-700">
                      {combo.hit_rate.toFixed(1)}%
                    </span>
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* disclaimer — 삭제·숨김·작은 글씨 금지 */}
          <div className="border border-amber-200 bg-amber-50 rounded-md px-4 py-3">
            <p className="text-sm text-amber-800 leading-relaxed">
              ⚠️ {result.disclaimer}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
